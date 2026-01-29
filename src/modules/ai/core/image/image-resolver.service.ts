import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storage } from '@google-cloud/storage';
import type { Part } from '@google-cloud/vertexai';

/**
 * Image source input for resolution.
 * At least one of key or url must be provided.
 */
export interface ImageSource {
    /** GCS storage key (e.g., "virtual-staging/temp/123.jpg") */
    key?: string;
    /** External HTTP/HTTPS URL */
    url?: string;
}

/**
 * Result of downloading an image.
 */
export interface DownloadedImage {
    buffer: Buffer;
    mimeType: string;
}

/**
 * MIME type mapping for common image extensions.
 */
const MIME_TYPES: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    bmp: 'image/bmp',
    tiff: 'image/tiff',
};

const DEFAULT_MIME_TYPE = 'image/jpeg';

/**
 * Image Resolver Service
 *
 * Provides unified image resolution logic for AI providers.
 * Consolidates duplicate implementations across vision and image generation providers.
 *
 * Supports:
 * - GCS storage keys (gs:// references)
 * - External HTTP/HTTPS URLs
 * - Conversion to base64 and Gemini-compatible Parts
 *
 * @example
 * ```typescript
 * // Get base64 from any source
 * const base64 = await imageResolver.toBase64({ key: 'path/to/image.jpg' });
 *
 * // Get Gemini-compatible Part
 * const part = await imageResolver.toGeminiPart({ url: 'https://example.com/image.png' });
 * ```
 */
@Injectable()
export class ImageResolverService {
    private readonly logger = new Logger(ImageResolverService.name);
    private readonly storage: Storage;
    private readonly bucketName: string;

    constructor(private readonly configService: ConfigService) {
        this.bucketName = this.configService.get<string>('GOOGLE_STORAGE_BUCKET') ?? '';
        this.storage = new Storage();
    }

    /**
     * Converts an image source to base64 string.
     *
     * @param input - Image source (GCS key or URL)
     * @returns Base64-encoded image data
     * @throws BadRequestException if no valid source is provided
     */
    async toBase64(input: ImageSource): Promise<string> {
        if (input.key) {
            return this.downloadFromGcs(input.key);
        }

        if (input.url) {
            const { buffer } = await this.downloadFromUrl(input.url);
            return buffer.toString('base64');
        }

        throw new BadRequestException('No valid image source provided (key or url required)');
    }

    /**
     * Converts an image source to a Gemini-compatible Part.
     * Uses native GCS reference when possible (more efficient).
     *
     * @param input - Image source (GCS key or URL)
     * @returns Gemini Part object for API requests
     * @throws BadRequestException if no valid source is provided
     */
    async toGeminiPart(input: ImageSource): Promise<Part> {
        if (input.key) {
            return this.createGcsReferencePart(input.key);
        }

        if (input.url) {
            return this.createInlineDataPart(input.url);
        }

        throw new BadRequestException('No valid image source provided (key or url required)');
    }

    /**
     * Downloads an image from an external URL.
     *
     * @param url - HTTP/HTTPS URL to download from
     * @returns Downloaded image buffer and detected MIME type
     * @throws BadRequestException if download fails
     */
    async downloadFromUrl(url: string): Promise<DownloadedImage> {
        try {
            this.logger.debug(`Downloading image from URL: ${url}`);
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type') || DEFAULT_MIME_TYPE;
            const arrayBuffer = await response.arrayBuffer();

            return {
                buffer: Buffer.from(arrayBuffer),
                mimeType: contentType.split(';')[0], // Remove charset if present
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`Failed to download image from ${url}: ${message}`);
            throw new BadRequestException(`Cannot download image: ${message}`);
        }
    }

    /**
     * Infers MIME type from file extension.
     *
     * @param filename - Filename or path with extension
     * @returns MIME type string (defaults to image/jpeg)
     */
    inferMimeType(filename: string): string {
        const ext = filename.split('.').pop()?.toLowerCase() ?? '';
        return MIME_TYPES[ext] ?? DEFAULT_MIME_TYPE;
    }

    /**
     * Validates that an image source has at least one valid property.
     *
     * @param input - Image source to validate
     * @returns True if valid
     * @throws BadRequestException if neither key nor url is provided
     */
    validateSource(input: ImageSource): boolean {
        if (!input.key && !input.url) {
            throw new BadRequestException('Either imageKey or imageUrl must be provided');
        }
        return true;
    }

    /**
     * Checks if a URL is a valid HTTP/HTTPS URL.
     *
     * @param url - URL string to validate
     * @returns True if valid HTTP/HTTPS URL
     */
    isValidHttpUrl(url: string | null | undefined): boolean {
        if (!url) return false;
        return url.startsWith('http://') || url.startsWith('https://');
    }

    /**
     * Gets the GCS URI for a storage key.
     *
     * @param key - GCS storage key
     * @returns Full gs:// URI
     */
    getGcsUri(key: string): string {
        return `gs://${this.bucketName}/${key}`;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private Methods
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Downloads file from GCS and returns as base64.
     */
    private async downloadFromGcs(key: string): Promise<string> {
        this.logger.debug(`Downloading from GCS: ${key}`);
        const file = this.storage.bucket(this.bucketName).file(key);
        const [buffer] = await file.download();
        return buffer.toString('base64');
    }

    /**
     * Creates a Gemini Part using native GCS reference (most efficient).
     */
    private createGcsReferencePart(key: string): Part {
        const gsUri = this.getGcsUri(key);
        const mimeType = this.inferMimeType(key);

        this.logger.debug(`Using native GCS reference: ${gsUri}`);

        return {
            fileData: {
                fileUri: gsUri,
                mimeType,
            },
        };
    }

    /**
     * Creates a Gemini Part with inline base64 data from URL.
     */
    private async createInlineDataPart(url: string): Promise<Part> {
        this.logger.debug(`Creating inline data part from URL: ${url}`);
        const { buffer, mimeType } = await this.downloadFromUrl(url);

        return {
            inlineData: {
                mimeType,
                data: buffer.toString('base64'),
            },
        };
    }
}
