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
        // Usamos us-central1 por defecto (Gemini multimodal suele estar aquí)
        this.location = this.configService.get<string>('GCP_IMAGEN_LOCATION', 'us-central1');
        this.bucketName = this.configService.get<string>('GOOGLE_STORAGE_BUCKET') ?? '';

        // 🔥 RECUPERADO: Se lee del .env (GCP_IMAGEN_MODEL)
        // Valor por defecto: 'gemini-2.0-flash-exp' (o puedes poner 'gemini-3-pro-image-preview' en tu .env)
        this.MODEL_NAME = this.configService.get<string>('GCP_IMAGEN_MODEL', 'gemini-2.0-flash-exp');

        this.storage = new Storage();

        this.logger.log(`✅ ImagenProvider initialized using model: ${this.MODEL_NAME} in ${this.location}`);
    }

    async generate(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
        const startTime = Date.now();

        // 1. Obtener Token
        const auth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' });
        const client = await auth.getClient();
        const accessToken = await client.getAccessToken();
        const token = accessToken.token;

        // 2. Endpoint de Generación de Gemini
        // NOTA: Usamos :generateContent porque es la API de Gemini (que soporta input multimodal)
        const endpoint = `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${this.MODEL_NAME}:generateContent`;

        this.logger.debug(`🚀 Virtual Staging via Gemini Multimodal: ${endpoint}`);

        // 3. Preparar las "Partes" (Imágenes + Texto)
        const parts: any[] = [];

        // A. Añadir la imagen de la SALA (Contexto Visual)
        if (request.imageSource.key || request.imageSource.url) {
            try {
                const roomBase64 = await this.resolveImageBase64(request.imageSource);
                parts.push({
                    inlineData: {
                        mimeType: 'image/jpeg',
                        data: roomBase64
                    }
                });
                this.logger.debug('✅ Room image added to prompt context');
            } catch (e) {
                this.logger.warn(`Could not load source image: ${e.message}. Proceeding with text only.`);
            }
        }

        // A2. IMÁGENES DE REFERENCIA (Los Productos)
        if (request.referenceImages && request.referenceImages.length > 0) {
            this.logger.debug(`📸 Adding ${request.referenceImages.length} product reference images...`);

            for (const productUrl of request.referenceImages) {
                try {
                    // Reutilizamos tu lógica de descarga
                    const productBase64 = await this.resolveImageBase64({ url: productUrl });
                    parts.push({
                        inlineData: { mimeType: 'image/jpeg', data: productBase64 }
                    });
                } catch (e) {
                    this.logger.warn(`Failed to load product image ${productUrl}: ${e.message}`);
                }
            }
        }

        // B. Añadir el Prompt de Texto
        parts.push({ text: this.buildPrompt(request) });

        // 4. Construir el Body para Gemini
        const body = {
            contents: [{ role: 'user', parts: parts }],
            generationConfig: {
                responseModalities: ["IMAGE"],
                temperature: 0.4,
                maxOutputTokens: 8192,
            },
            safetySettings: [
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' }
            ]
        };

        try {
            // 5. Llamada REST
            const response = await axios.post(endpoint, body, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            // 6. Extraer la imagen de la respuesta de Gemini
            const candidates = response.data.candidates;
            if (!candidates || candidates.length === 0) throw new Error('No content generated');

            const generatedPart = candidates[0].content.parts[0];

            // Verificamos si realmente nos devolvió una imagen
            if (!generatedPart.inlineData || !generatedPart.inlineData.data) {
                this.logger.error('Gemini response:', JSON.stringify(candidates[0]));
                throw new Error('Gemini returned text instead of image. Verify model supports image generation.');
            }

            const base64Image = generatedPart.inlineData.data;

            // 7. Subir a Storage
            const imageUrl = await this.uploadToGcs(base64Image);

            return {
                imageUrl,
                metadata: { model: this.MODEL_NAME, generationTimeMs: Date.now() - startTime },
            };

        } catch (error) {
            const msg = error.response?.data?.error?.message || error.message;
            this.logger.error(`❌ Gemini Generation Failed: ${msg}`);
            throw new Error(`Virtual Staging failed: ${msg}`);
        }
    }

    // --- Helpers ---

    private buildPrompt(request: ImageGenerationRequest): string {
        const hasProducts = request.referenceImages && request.referenceImages.length > 0;

        return `You are an expert interior designer. 
        
        INPUTS:
        - Image 1: The EMPTY ROOM to be furnished.
        ${hasProducts ? '- Subsequent Images: REAL FURNITURE products to be placed in the room.' : ''}
        
        TASK:
        Generate a photorealistic image of the room fully furnished.
        
        STRICT RULES:
        1. PRESERVE the room's structural integrity (walls, windows, floor, lighting) from Image 1.
        ${hasProducts ? '2. Use the visual details from the furniture reference images to place them in the room.' : ''}
        3. ${request.prompt}
        4. Style: ${request.style || 'Modern'}.
        5. Output ONLY the final generated image.`;
    }

    private async resolveImageBase64(input: any): Promise<string> {
        if (input.key) {
            const file = this.storage.bucket(this.bucketName).file(input.key);
            const [buffer] = await file.download();
            return buffer.toString('base64');
        } else if (input.url) {
            const res = await fetch(input.url);
            if (!res.ok) throw new Error(`Failed to fetch image: ${res.statusText}`);
            const arrayBuffer = await res.arrayBuffer();
            return Buffer.from(arrayBuffer).toString('base64');
        }
        throw new Error('No image source');
    }

    private async uploadToGcs(base64: string): Promise<string> {
        const buffer = Buffer.from(base64, 'base64');
        const filename = `generated/staging-${uuidv4()}.png`;
        const file = this.storage.bucket(this.bucketName).file(filename);

        await file.save(buffer, {
            contentType: 'image/png',
            metadata: { cacheControl: 'public, max-age=31536000' }
        });

        return `https://storage.googleapis.com/${this.bucketName}/${filename}`;
    }
}
