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

        // Detect aspect ratio from source image or use provided value
        const aspectRatio = await this.detectAspectRatio(request);
        this.logger.debug(`🖼️ Using aspect ratio: ${aspectRatio}`);

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
                        // Match the original image aspect ratio
                        imageConfig: {
                            aspectRatio: aspectRatio,
                        },
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
     * Detects the aspect ratio from the source image or uses provided value.
     * Maps to the closest supported aspect ratio.
     * 
     * Supported ratios: '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9', '5:4', '4:5'
     */
    private async detectAspectRatio(request: ImageGenerationRequest): Promise<string> {
        // If explicitly provided, use it
        if (request.aspectRatio) {
            return request.aspectRatio;
        }

        // Try to detect from source image
        try {
            const imageBuffer = await this.getSourceImageBuffer(request);
            if (imageBuffer) {
                const dimensions = this.getImageDimensions(imageBuffer);
                if (dimensions) {
                    const ratio = dimensions.width / dimensions.height;
                    return this.mapToSupportedAspectRatio(ratio);
                }
            }
        } catch (e) {
            this.logger.warn(`Could not detect aspect ratio: ${e.message}`);
        }

        // Default to 4:3 (common room photo ratio)
        return '4:3';
    }

    /**
     * Gets the source image as a buffer for dimension detection.
     */
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

    /**
     * Extracts image dimensions from buffer (supports PNG, JPEG, WebP).
     * Simple header parsing without external dependencies.
     */
    private getImageDimensions(buffer: Buffer): { width: number; height: number } | null {
        try {
            // PNG: dimensions at bytes 16-24
            if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
                const width = buffer.readUInt32BE(16);
                const height = buffer.readUInt32BE(20);
                return { width, height };
            }

            // JPEG: scan for SOF0 marker (0xFFC0)
            if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
                this.logger.debug('📷 Detected JPEG format');

                // First, check for EXIF orientation
                const orientation = this.getJpegExifOrientation(buffer);
                const needsRotation = orientation >= 5 && orientation <= 8; // 5-8 means rotated 90° or 270°

                let offset = 2;
                while (offset < buffer.length - 10) {
                    if (buffer[offset] === 0xFF) {
                        const marker = buffer[offset + 1];
                        // SOF0, SOF1, SOF2 markers contain dimensions
                        if (marker >= 0xC0 && marker <= 0xC2) {
                            let height = buffer.readUInt16BE(offset + 5);
                            let width = buffer.readUInt16BE(offset + 7);

                            // Swap dimensions if EXIF indicates rotation
                            if (needsRotation) {
                                this.logger.debug(`📷 EXIF orientation ${orientation} - swapping dimensions`);
                                [width, height] = [height, width];
                            }

                            this.logger.debug(`📷 JPEG dimensions: ${width}x${height}`);
                            return { width, height };
                        }
                        // Skip to next marker
                        if (offset + 2 < buffer.length) {
                            const length = buffer.readUInt16BE(offset + 2);
                            offset += 2 + length;
                        } else {
                            break;
                        }
                    } else {
                        offset++;
                    }
                }
                this.logger.warn('📷 JPEG: Could not find SOF marker with dimensions');
            }

            // WebP: 'RIFF....WEBP' format
            if (buffer.slice(0, 4).toString() === 'RIFF' && buffer.slice(8, 12).toString() === 'WEBP') {
                this.logger.debug('📷 Detected WebP format');
                // VP8 chunk starts at byte 12
                const width = buffer.readUInt16LE(26) & 0x3FFF;
                const height = buffer.readUInt16LE(28) & 0x3FFF;
                if (width > 0 && height > 0) {
                    this.logger.debug(`📷 WebP dimensions: ${width}x${height}`);
                    return { width, height };
                }
            }

            // Unknown format - log first bytes for debugging
            this.logger.warn(`📷 Unknown image format. First 4 bytes: ${buffer.slice(0, 4).toString('hex')}`);
        } catch (e) {
            this.logger.debug(`Could not parse image dimensions: ${e.message}`);
        }
        return null;
    }

    /**
     * Reads EXIF orientation from JPEG buffer.
     * Returns orientation value 1-8, or 1 (normal) if not found.
     * 
     * Orientation values:
     * 1 = Normal
     * 3 = Upside down (180°)
     * 5, 7 = Rotated 90° counter-clockwise (swap W/H)
     * 6, 8 = Rotated 90° clockwise (swap W/H)
     */
    private getJpegExifOrientation(buffer: Buffer): number {
        try {
            // Look for EXIF marker (APP1 = 0xFFE1)
            let offset = 2;
            while (offset < buffer.length - 12) {
                if (buffer[offset] === 0xFF && buffer[offset + 1] === 0xE1) {
                    // Found APP1 (EXIF)
                    const exifStart = offset + 4;

                    // Check for 'Exif' signature
                    if (buffer.slice(exifStart, exifStart + 4).toString() !== 'Exif') {
                        break;
                    }

                    const tiffStart = exifStart + 6;
                    const isLittleEndian = buffer.slice(tiffStart, tiffStart + 2).toString() === 'II';

                    // Read IFD0 entry count
                    const ifdOffset = tiffStart + 8;
                    const entryCount = isLittleEndian
                        ? buffer.readUInt16LE(ifdOffset)
                        : buffer.readUInt16BE(ifdOffset);

                    // Search for orientation tag (0x0112)
                    for (let i = 0; i < entryCount; i++) {
                        const entryOffset = ifdOffset + 2 + (i * 12);
                        const tag = isLittleEndian
                            ? buffer.readUInt16LE(entryOffset)
                            : buffer.readUInt16BE(entryOffset);

                        if (tag === 0x0112) { // Orientation tag
                            const orientation = isLittleEndian
                                ? buffer.readUInt16LE(entryOffset + 8)
                                : buffer.readUInt16BE(entryOffset + 8);
                            this.logger.debug(`📷 EXIF orientation found: ${orientation}`);
                            return orientation;
                        }
                    }
                    break;
                }

                // Move to next marker
                if (buffer[offset] === 0xFF) {
                    const length = buffer.readUInt16BE(offset + 2);
                    offset += 2 + length;
                } else {
                    offset++;
                }
            }
        } catch (e) {
            this.logger.debug(`Could not read EXIF orientation: ${e.message}`);
        }
        return 1; // Default: normal orientation
    }

    /**
     * Maps a numeric ratio to the closest supported aspect ratio string.
     */
    private mapToSupportedAspectRatio(ratio: number): string {
        const supportedRatios = [
            { name: '21:9', value: 21 / 9 },   // 2.33
            { name: '16:9', value: 16 / 9 },   // 1.78
            { name: '3:2', value: 3 / 2 },     // 1.50
            { name: '4:3', value: 4 / 3 },     // 1.33
            { name: '5:4', value: 5 / 4 },     // 1.25
            { name: '1:1', value: 1 },         // 1.00
            { name: '4:5', value: 4 / 5 },     // 0.80
            { name: '3:4', value: 3 / 4 },     // 0.75
            { name: '2:3', value: 2 / 3 },     // 0.67
            { name: '9:16', value: 9 / 16 },   // 0.56
        ];

        let closest = supportedRatios[0];
        let minDiff = Math.abs(ratio - closest.value);

        for (const supported of supportedRatios) {
            const diff = Math.abs(ratio - supported.value);
            if (diff < minDiff) {
                minDiff = diff;
                closest = supported;
            }
        }

        this.logger.debug(`Detected ratio ${ratio.toFixed(2)} → mapped to ${closest.name}`);
        return closest.name;
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
