import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuth } from 'google-auth-library';
import { Storage } from '@google-cloud/storage';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import {
    IImageGenerator,
    ImageGenerationRequest,
    ImageGenerationResult,
} from '../../interfaces/image-generator.interface';

@Injectable()
export class ImagenProvider implements IImageGenerator {
    private readonly logger = new Logger(ImagenProvider.name);
    private readonly storage: Storage;
    
    private readonly bucketName: string;
    private readonly projectId: string;
    private readonly location: string;
    private readonly MODEL_NAME: string;

    constructor(private readonly configService: ConfigService) {
        this.projectId = this.configService.get<string>('GCP_PROJECT_ID') ?? '';
        // Usamos us-central1 (o la que funcionó en tu Postman)
        this.location = this.configService.get<string>('GCP_IMAGEN_LOCATION', 'us-central1'); 
        this.bucketName = this.configService.get<string>('GOOGLE_STORAGE_BUCKET') ?? '';
        
        // Modelo ESTÁNDAR (El que tiene cuota y funciona con texto)
        this.MODEL_NAME = this.configService.get<string>('GCP_IMAGEN_MODEL', 'imagen-3.0-generate-001');

        this.storage = new Storage();
    }

    async generate(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
        const startTime = Date.now();

        // 1. Obtener Token de Acceso (Igual que 'gcloud auth print-access-token')
        const auth = new GoogleAuth({
            scopes: 'https://www.googleapis.com/auth/cloud-platform'
        });
        const client = await auth.getClient();
        const accessToken = await client.getAccessToken();
        const token = accessToken.token;

        if (!token) throw new Error('Could not retrieve Google Cloud access token');

        // 2. Endpoint REST (Exactamente el que usaste en Postman)
        const endpoint = `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${this.MODEL_NAME}:predict`;

        this.logger.debug(`🚀 Generating image via REST API: ${endpoint}`);

        // 3. Construir el Body JSON
        // IMPORTANTE: Este modelo es TEXT-TO-IMAGE. No enviamos 'image' bytes aquí para evitar el error 13.
        const body = {
            instances: [
                {
                    prompt: this.buildPrompt(request),
                }
            ],
            parameters: {
                sampleCount: 1,
                aspectRatio: "1:1", // Puedes cambiar a "16:9" si prefieres
                // includeRaiReasoning: true // Útil para depurar filtros de seguridad
            }
        };

        try {
            // 4. Llamada HTTP directa
            const response = await axios.post(endpoint, body, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json; charset=utf-8'
                }
            });

            // 5. Procesar Respuesta
            const predictions = response.data.predictions;
            if (!predictions || predictions.length === 0) {
                throw new Error('No predictions returned from Vertex AI');
            }

            const base64Image = predictions[0].bytesBase64Encoded;
            if (!base64Image) {
                throw new Error('No image bytes found in response');
            }

            // 6. Subir a GCS y devolver URL
            const imageUrl = await this.uploadToGcs(base64Image);

            const generationTimeMs = Date.now() - startTime;
            this.logger.log(`✅ Image generated successfully in ${generationTimeMs}ms`);

            return {
                imageUrl,
                metadata: {
                    model: this.MODEL_NAME,
                    generationTimeMs,
                },
            };

        } catch (error) {
            // Manejo de errores detallado
            const apiError = error.response?.data?.error?.message || error.message;
            this.logger.error(`❌ REST API Failed: ${apiError}`);
            
            // Si es error de cuota, podrías implementar aquí el reintento simple
            if (apiError.includes('429')) {
                 this.logger.warn('Hit quota limit (429). Consider implementing a retry loop here.');
            }

            throw new Error(`Imagen generation failed: ${apiError}`);
        }
    }

    private buildPrompt(request: ImageGenerationRequest): string {
        let prompt = request.prompt;
        
        if (request.style === 'photorealistic') {
            prompt += ', photorealistic, 4k, natural lighting, interior design photography, high resolution';
        }

        if (request.negativePrompt) {
            prompt += ` --negative_prompt="${request.negativePrompt}"`;
        }

        return prompt;
    }

    private async uploadToGcs(base64: string): Promise<string> {
        const buffer = Buffer.from(base64, 'base64');
        const filename = `generated/staged-${uuidv4()}.png`;
        const file = this.storage.bucket(this.bucketName).file(filename);

        await file.save(buffer, {
            contentType: 'image/png',
            metadata: { cacheControl: 'public, max-age=31536000' },
        });

        // Asegúrate de que tu bucket permite lectura pública o usa signedUrl si es privado
        return `https://storage.googleapis.com/${this.bucketName}/${filename}`;
    }
}
