import { Injectable, Logger } from '@nestjs/common';
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
import { RetryService, ImageResolverService } from '../../core';
import { buildImageGenerationPrompt, STAGING_GENERATION_CONFIG } from '../../prompts';

/**
 * Gemini-based Image Generator implementation of IImageGenerator.
 * Uses Vertex AI Gemini multimodal models for image generation.
 *
 * Supports:
 * - Room image as context (GCS key or URL)
 * - Product reference images for visual consistency
 * - Configurable safety settings
 */
@Injectable()
export class ImagenProvider implements IImageGenerator {
    private readonly logger = new Logger(ImagenProvider.name);
    private readonly storage: Storage;

    private readonly bucketName: string;
    private readonly projectId: string;
    private readonly location: string;
    private readonly MODEL_NAME: string;

    constructor(
        private readonly configService: ConfigService,
        private readonly retryService: RetryService,
        private readonly imageResolver: ImageResolverService,
    ) {
        this.projectId = this.configService.get<string>('GCP_PROJECT_ID') ?? '';
        this.location = this.configService.get<string>('GCP_IMAGEN_LOCATION', 'us-central1');
        this.bucketName = this.configService.get<string>('GOOGLE_STORAGE_BUCKET') ?? '';
        this.MODEL_NAME = this.configService.get<string>('GCP_IMAGEN_MODEL', 'gemini-2.0-flash-exp');

        this.storage = new Storage();

        this.logger.log(`✅ ImagenProvider initialized using model: ${this.MODEL_NAME} in ${this.location}`);
    }

    async generate(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
        const startTime = Date.now();

        const token = await this.getAccessToken();
        const endpoint = this.buildEndpoint();
        const parts = await this.buildRequestParts(request);

        this.logger.debug(`Generating staged image via ${this.MODEL_NAME}`);

        const body = {
            contents: [{ role: 'user', parts }],
            generationConfig: STAGING_GENERATION_CONFIG.generationConfig,
            safetySettings: STAGING_GENERATION_CONFIG.safetySettings,
        };

        try {
            const response = await this.retryService.withExponentialBackoff(
                () => axios.post(endpoint, body, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }),
                {
                    operationName: `Gemini Image Generation (${this.MODEL_NAME})`,
                    isRetryable: (err) => this.retryService.isQuotaExceededError(err),
                    initialDelayMs: 2000,
                },
            );

            const base64Image = this.extractImageFromResponse(response.data);
            const imageUrl = await this.uploadToGcs(base64Image);

            return {
                imageUrl,
                metadata: { model: this.MODEL_NAME, generationTimeMs: Date.now() - startTime },
            };
        } catch (error) {
            const msg = error.response?.data?.error?.message || error.message;
            this.logger.error(`Image generation failed: ${msg}`);
            throw new Error(`Virtual Staging failed: ${msg}`);
        }
    }

    /**
     * Gets OAuth2 access token for GCP API calls.
     */
    private async getAccessToken(): Promise<string> {
        const auth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' });
        const client = await auth.getClient();
        const accessToken = await client.getAccessToken();
        return accessToken.token ?? '';
    }

    /**
     * Builds the Vertex AI endpoint URL.
     */
    private buildEndpoint(): string {
        return `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${this.MODEL_NAME}:generateContent`;
    }

    /**
     * Builds request parts array (images + text prompt).
     */
    private async buildRequestParts(request: ImageGenerationRequest): Promise<any[]> {
        const parts: any[] = [];

        // Add room image
        if (request.imageSource.key || request.imageSource.url) {
            try {
                const roomBase64 = await this.imageResolver.toBase64(request.imageSource);
                parts.push({
                    inlineData: {
                        mimeType: request.imageSource.key
                            ? this.imageResolver.inferMimeType(request.imageSource.key)
                            : 'image/jpeg',
                        data: roomBase64
                    }
                });
                this.logger.debug('Room image added to context');
            } catch (e) {
                this.logger.warn(`Could not load source image: ${e.message}`);
            }
        }

        // Add product reference images
        if (request.referenceImages?.length) {
            this.logger.debug(`Adding ${request.referenceImages.length} reference images`);
            for (const productUrl of request.referenceImages) {
                try {
                    const productBase64 = await this.imageResolver.toBase64({ url: productUrl });
                    parts.push({
                        inlineData: { mimeType: 'image/jpeg', data: productBase64 }
                    });
                } catch (e) {
                    this.logger.warn(`Failed to load product image ${productUrl}: ${e.message}`);
                }
            }
        }

        // Add text prompt
        parts.push({ text: buildImageGenerationPrompt(request) });

        return parts;
    }

    /**
     * Extracts base64 image from Gemini response.
     */
    private extractImageFromResponse(data: any): string {
        const candidates = data.candidates;
        if (!candidates?.length) {
            throw new Error('No content generated');
        }

        const generatedPart = candidates[0].content.parts[0];
        if (!generatedPart.inlineData?.data) {
            this.logger.error('Unexpected response:', JSON.stringify(candidates[0]));
            throw new Error('Model returned text instead of image. Verify model supports image generation.');
        }

        return generatedPart.inlineData.data;
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
