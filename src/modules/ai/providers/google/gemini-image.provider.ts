import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { Storage } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';
import {
    IImageGenerator,
    ImageGenerationRequest,
    ImageGenerationResult,
} from '../../interfaces/image-generator.interface';
import { RetryService, ImageResolverService } from '../../core';
import { IMAGE_GENERATION_CONFIG } from '../../prompts';
import { getImageDimensions, mapToSupportedAspectRatio } from '../helpers';

@Injectable()
export class GeminiImageProvider implements IImageGenerator {
    private readonly logger = new Logger(GeminiImageProvider.name);
    private readonly ai: GoogleGenAI;
    private readonly storage: Storage;
    private readonly bucketName: string;
    private readonly MODEL_NAME: string;
    private readonly location: string;

    constructor(
        private readonly configService: ConfigService,
        private readonly retryService: RetryService,
        private readonly imageResolver: ImageResolverService,
    ) {
        const projectId = this.configService.get<string>('GCP_PROJECT_ID') ?? '';
        this.location = this.configService.get<string>('GCP_IMAGEN_LOCATION', 'global');
        this.bucketName = this.configService.get<string>('GOOGLE_STORAGE_BUCKET') ?? '';
        this.MODEL_NAME = this.configService.get<string>('GCP_IMAGEN_MODEL', 'gemini-3-pro-image-preview');

        if (!projectId) {
            this.logger.error('GCP_PROJECT_ID not configured');
            throw new Error('GCP_PROJECT_ID is required for GeminiImageProvider');
        }

        this.ai = new GoogleGenAI({
            vertexai: true,
            project: projectId,
            location: this.location,
        });

        this.storage = new Storage();
        this.logger.log(`✅ GeminiImageProvider initialized (${this.MODEL_NAME} @ ${this.location})`);
    }

    async generate(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
        const startTime = Date.now();
        const aspectRatio = await this.detectAspectRatio(request);
        const contentParts = await this.buildRequestParts(request);

        this.logger.debug(`🖼️ Generating staged image (${this.MODEL_NAME}, ${aspectRatio})`);

        try {
            const response = await this.retryService.withExponentialBackoff(
                () => this.ai.models.generateContent({
                    model: this.MODEL_NAME,
                    contents: contentParts,
                    config: {
                        responseModalities: ['IMAGE'],
                        temperature: IMAGE_GENERATION_CONFIG.generationConfig.temperature,
                        imageConfig: { aspectRatio },
                    },
                }),
                {
                    operationName: `Gemini Image Generation (${this.MODEL_NAME})`,
                    isRetryable: (err) => this.retryService.isQuotaExceededError(err),
                    initialDelayMs: 2000,
                },
            );

            const base64Image = this.extractImageFromResponse(response);
            const imageUrl = await this.uploadToGcs(base64Image);

            return {
                imageUrl,
                metadata: {
                    model: this.MODEL_NAME,
                    generationTimeMs: Date.now() - startTime
                },
            };
        } catch (error) {
            this.logger.error(`Image generation failed: ${error.message}`);
            throw new Error(`Virtual Staging failed: ${error.message}`);
        }
    }

    private async detectAspectRatio(request: ImageGenerationRequest): Promise<string> {
        if (request.aspectRatio) return request.aspectRatio;

        try {
            const imageBuffer = await this.getSourceImageBuffer(request);
            if (imageBuffer) {
                const dimensions = getImageDimensions(imageBuffer);
                if (dimensions) {
                    return mapToSupportedAspectRatio(dimensions.width / dimensions.height);
                }
            }
        } catch (e) {
            this.logger.warn(`Could not detect aspect ratio: ${e.message}`);
        }

        return '4:3';
    }

    private async getSourceImageBuffer(request: ImageGenerationRequest): Promise<Buffer | null> {
        try {
            if (request.imageSource.key) {
                const file = this.storage.bucket(this.bucketName).file(request.imageSource.key);
                const [buffer] = await file.download();
                return buffer;
            }
            if (request.imageSource.url) {
                const response = await fetch(request.imageSource.url);
                const arrayBuffer = await response.arrayBuffer();
                return Buffer.from(arrayBuffer);
            }
        } catch (e) {
            this.logger.debug(`Could not get source image buffer: ${e.message}`);
        }
        return null;
    }

    private async buildRequestParts(request: ImageGenerationRequest): Promise<any[]> {
        const parts: any[] = [];

        if (request.imageSource.key || request.imageSource.url) {
            try {
                const roomBase64 = await this.imageResolver.toBase64(request.imageSource);
                const mimeType = request.imageSource.key
                    ? this.imageResolver.inferMimeType(request.imageSource.key)
                    : 'image/jpeg';

                parts.push({ inlineData: { mimeType, data: roomBase64 } });
                this.logger.debug('✅ Room image added');
            } catch (e) {
                this.logger.error(`❌ Could not load source image: ${e.message}`);
                throw new Error(`Failed to load room image: ${e.message}`);
            }
        }

        if (request.referenceImages?.length) {
            this.logger.debug(`📦 Loading ${request.referenceImages.length} product images...`);
            let successCount = 0;

            for (let i = 0; i < request.referenceImages.length; i++) {
                try {
                    const productBase64 = await this.imageResolver.toBase64({ url: request.referenceImages[i] });
                    parts.push({ inlineData: { mimeType: 'image/jpeg', data: productBase64 } });
                    successCount++;
                } catch (e) {
                    this.logger.error(`❌ Failed product ${i + 1}: ${e.message}`);
                }
            }

            this.logger.log(`📦 Added ${successCount}/${request.referenceImages.length} product images`);
        } else {
            this.logger.warn('⚠️ No reference images provided');
        }

        parts.push({ text: request.prompt });
        this.logger.debug(`📤 Request: ${parts.length - 1} images + prompt`);

        return parts;
    }

    private extractImageFromResponse(response: any): string {
        const candidates = response.candidates;
        if (!candidates?.length) throw new Error('No content generated');

        const content = candidates[0].content;
        if (!content?.parts?.length) throw new Error('No parts in response');

        const imagePart = content.parts.find((part: any) => part.inlineData?.data);
        if (!imagePart?.inlineData?.data) {
            this.logger.error('Response structure:', JSON.stringify(candidates[0]));
            throw new Error('Model returned text instead of image');
        }

        return imagePart.inlineData.data;
    }

    private async uploadToGcs(base64: string): Promise<string> {
        const buffer = Buffer.from(base64, 'base64');
        const filename = `generated/staging-${uuidv4()}.png`;
        const file = this.storage.bucket(this.bucketName).file(filename);

        await file.save(buffer, {
            contentType: 'image/png',
            metadata: { cacheControl: 'public, max-age=31536000' },
        });

        return `https://storage.googleapis.com/${this.bucketName}/${filename}`;
    }
}
