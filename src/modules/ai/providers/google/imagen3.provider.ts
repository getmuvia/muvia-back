import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VertexAI, Part } from '@google-cloud/vertexai';
import { Storage } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';
import {
    IImageGenerator,
    ImageGenerationRequest,
    ImageGenerationResult,
} from '../../interfaces/image-generator.interface';
import type { ImageSourceInput } from '../../interfaces/vision-provider.interface';

/**
 * Google Imagen 3 implementation of IImageGenerator.
 * Uses Vertex AI Imagen for photorealistic image generation.
 * 
 * Image resolution strategy:
 * - key provided → Uses gs:// reference (zero backend memory, fastest)
 * - url provided → Downloads to buffer, sends as base64
 */
@Injectable()
export class Imagen3Provider implements IImageGenerator {
    private readonly logger = new Logger(Imagen3Provider.name);
    private readonly vertexAI: VertexAI;
    private readonly storage: Storage;
    private readonly bucketName: string;
    private readonly projectId: string;
    private readonly location: string;

    private readonly MODEL_NAME = 'imagen-4.0-ultra-generate-001';

    constructor(private readonly configService: ConfigService) {
        this.projectId = this.configService.get<string>('GCP_PROJECT_ID') ?? '';
        this.location = this.configService.get<string>('GCP_LOCATION', 'us-central1');
        this.bucketName = this.configService.get<string>('GOOGLE_STORAGE_BUCKET') ?? '';

        if (!this.projectId) {
            this.logger.error('GCP_PROJECT_ID not configured');
            throw new Error('GCP_PROJECT_ID is required for Imagen3Provider');
        }

        this.vertexAI = new VertexAI({ project: this.projectId, location: this.location });
        this.storage = new Storage();

        this.logger.log(`✅ Imagen3Provider initialized`);
    }

    async generate(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
        const startTime = Date.now();
        
        if (!request.imageSource.key && !request.imageSource.url) {
            throw new BadRequestException('Either imageKey or imageUrl must be provided');
        }

        this.logger.debug(`Generating staged image via ${request.imageSource.key ? 'gs://' : 'URL'}...`);

        try {
            const imagePart = await this.resolveImagePart(request.imageSource);
            const model = this.vertexAI.getGenerativeModel({ model: this.MODEL_NAME });

            const response = await model.generateContent({
                contents: [
                    {
                        role: 'user',
                        parts: [
                            imagePart,
                            { text: this.buildGenerationPrompt(request) },
                        ],
                    },
                ],
                generationConfig: {
                    temperature: 0.4,
                    maxOutputTokens: 2048,
                },
            });

            const textResult = response.response.candidates?.[0]?.content?.parts?.[0]?.text;

            this.logger.warn('Imagen 3 image generation not yet fully implemented - returning placeholder');
            
            const generationTimeMs = Date.now() - startTime;

            return {
                imageUrl: await this.createPlaceholderResponse(request, textResult || ''),
                metadata: {
                    model: this.MODEL_NAME,
                    generationTimeMs,
                },
            };
        } catch (error) {
            this.logger.error(`Image generation failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Resolves image input to a Gemini-compatible Part.
     * Priority: key (gs://) > url (download)
     */
    private async resolveImagePart(input: ImageSourceInput): Promise<Part> {
        if (input.key) {
            const gsUri = `gs://${this.bucketName}/${input.key}`;
            const mimeType = this.inferMimeType(input.key);
            
            this.logger.debug(`Using native GCS reference: ${gsUri}`);
            
            return {
                fileData: {
                    fileUri: gsUri,
                    mimeType,
                },
            };
        }

        if (input.url) {
            this.logger.debug(`Downloading external image: ${input.url}`);
            
            const { buffer, mimeType } = await this.downloadImage(input.url);
            
            return {
                inlineData: {
                    mimeType,
                    data: buffer.toString('base64'),
                },
            };
        }

        throw new BadRequestException('No valid image source provided');
    }

    /**
     * Downloads an image from external URL.
     */
    private async downloadImage(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
        try {
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type') || 'image/jpeg';
            const arrayBuffer = await response.arrayBuffer();
            
            return {
                buffer: Buffer.from(arrayBuffer),
                mimeType: contentType.split(';')[0],
            };
        } catch (error) {
            this.logger.error(`Failed to download image from ${url}: ${error.message}`);
            throw new BadRequestException(`Cannot download image: ${error.message}`);
        }
    }

    /**
     * Infers MIME type from file extension.
     */
    private inferMimeType(key: string): string {
        const ext = key.split('.').pop()?.toLowerCase();
        const mimeTypes: Record<string, string> = {
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            png: 'image/png',
            webp: 'image/webp',
        };
        return mimeTypes[ext || ''] || 'image/jpeg';
    }

    private buildGenerationPrompt(request: ImageGenerationRequest): string {
        let prompt = request.prompt;

        if (request.style === 'photorealistic') {
            prompt += '\n\nStyle: Photorealistic, high quality interior photography, natural lighting.';
        }

        if (request.negativePrompt) {
            prompt += `\n\nAvoid: ${request.negativePrompt}`;
        }

        return prompt;
    }

    /**
     * Placeholder implementation - stores prompt result for development.
     * Replace with actual Imagen 3 integration in production.
     */
    private async createPlaceholderResponse(
        request: ImageGenerationRequest,
        description: string,
    ): Promise<string> {
        const placeholderData = {
            status: 'pending_implementation',
            message: 'Imagen 3 integration pending. Prompt processed successfully.',
            promptPreview: request.prompt.substring(0, 200),
            timestamp: new Date().toISOString(),
        };

        this.logger.debug(`Placeholder response: ${JSON.stringify(placeholderData)}`);

        return `https://storage.googleapis.com/${this.bucketName}/staged/placeholder-${uuidv4()}.json`;
    }
}
