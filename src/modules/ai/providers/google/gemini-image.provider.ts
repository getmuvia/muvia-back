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

/**
 * Gemini Image Provider using @google/genai SDK.
 * 
 * This provider uses the unified Google Gen AI SDK which properly
 * supports the global endpoint required for Gemini 3 Preview models.
 * 
 * Key features:
 * - Uses @google/genai instead of axios + google-auth-library  
 * - Properly handles 'global' location for preview models
 * - Supports multimodal input (images + text → image output)
 * - Uses ai.models.generateContent() API pattern
 * 
 * Environment variables:
 * - GCP_PROJECT_ID: Google Cloud project ID
 * - GCP_IMAGEN_LOCATION: Location (default: 'global')
 * - GCP_IMAGEN_MODEL: Model ID (default: 'gemini-3-pro-image-preview')
 * - GOOGLE_STORAGE_BUCKET: GCS bucket for generated images
 */
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

        // Initialize using @google/genai SDK with Vertex AI mode
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

        const contentParts = await this.buildRequestParts(request);

        this.logger.debug(`Generating staged image via ${this.MODEL_NAME}`);

        try {
            const response = await this.retryService.withExponentialBackoff(
                () => this.ai.models.generateContent({
                    model: this.MODEL_NAME,
                    contents: contentParts,
                    config: {
                        responseModalities: ['IMAGE'],
                        temperature: IMAGE_GENERATION_CONFIG.generationConfig.temperature,
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

    /**
     * Builds request parts array (images + text prompt).
     * Format compatible with @google/genai SDK.
     * 
     * Order: [Room Image] + [Product Images...] + [Text Prompt]
     * This order matches the prompt expectations (IMAGE 1 = room, IMAGES 2+ = products)
     */
    private async buildRequestParts(request: ImageGenerationRequest): Promise<any[]> {
        const parts: any[] = [];

        // Add room image (source image) - This becomes IMAGE 1 in the prompt
        if (request.imageSource.key || request.imageSource.url) {
            try {
                const roomBase64 = await this.imageResolver.toBase64(request.imageSource);
                const mimeType = request.imageSource.key
                    ? this.imageResolver.inferMimeType(request.imageSource.key)
                    : 'image/jpeg';

                parts.push({
                    inlineData: {
                        mimeType,
                        data: roomBase64,
                    },
                });
                this.logger.debug('✅ Room image (IMAGE 1) added to context');
            } catch (e) {
                this.logger.error(`❌ CRITICAL: Could not load source image: ${e.message}`);
                throw new Error(`Failed to load room image: ${e.message}`);
            }
        }

        // Add product reference images - These become IMAGES 2, 3, 4... in the prompt
        if (request.referenceImages?.length) {
            this.logger.debug(`📦 Processing ${request.referenceImages.length} product reference images...`);
            let successCount = 0;

            for (let i = 0; i < request.referenceImages.length; i++) {
                const productUrl = request.referenceImages[i];
                try {
                    this.logger.debug(`  Loading product ${i + 1}: ${productUrl.substring(0, 80)}...`);
                    const productBase64 = await this.imageResolver.toBase64({ url: productUrl });
                    parts.push({
                        inlineData: {
                            mimeType: 'image/jpeg',
                            data: productBase64
                        },
                    });
                    successCount++;
                    this.logger.debug(`  ✅ Product ${i + 1} (IMAGE ${i + 2}) loaded successfully`);
                } catch (e) {
                    this.logger.error(`  ❌ Failed to load product ${i + 1}: ${e.message}`);
                }
            }

            this.logger.log(`📦 Added ${successCount}/${request.referenceImages.length} product images to request`);
        } else {
            this.logger.warn('⚠️ No reference images provided - generating without product references');
        }

        // Add text prompt (already built by VirtualStagingService using buildStagingPrompt)
        parts.push({ text: request.prompt });

        this.logger.debug(`📤 Total parts in request: ${parts.length} (${parts.length - 1} images + 1 prompt)`);

        return parts;
    }

    /**
     * Extracts base64 image from @google/genai response.
     */
    private extractImageFromResponse(response: any): string {
        // The @google/genai SDK response structure
        const candidates = response.candidates;
        if (!candidates?.length) {
            throw new Error('No content generated');
        }

        const content = candidates[0].content;
        if (!content?.parts?.length) {
            throw new Error('No parts in response');
        }

        // Find the image part in the response
        const imagePart = content.parts.find((part: any) => part.inlineData?.data);

        if (!imagePart?.inlineData?.data) {
            this.logger.error('Unexpected response structure:', JSON.stringify(candidates[0]));
            throw new Error('Model returned text instead of image. Verify model supports image generation.');
        }

        return imagePart.inlineData.data;
    }

    /**
     * Uploads base64 image to Google Cloud Storage.
     */
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
