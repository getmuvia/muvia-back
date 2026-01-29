import { IsOptional, IsString, IsIn, IsUrl, IsNumber, Min, Max, ValidateIf } from 'class-validator';
import type { RoomAnalysisResult } from '../interfaces/vision-provider.interface';
import type { HybridProductResult } from '../interfaces/search-result.interface';
import { DESIGN_STYLES, VALIDATION } from '../constants';

/**
 * Request DTO for virtual staging endpoint.
 *
 * Requires either `gcsStorageKey` (for internally uploaded images) or
 * `externalImageUrl` (for externally hosted images). At least one must be provided.
 *
 * @example
 * // Using GCS storage key (recommended for uploaded images)
 * { "gcsStorageKey": "virtual-staging/temp/abc123.jpg" }
 *
 * // Using external URL
 * { "externalImageUrl": "https://example.com/room.jpg" }
 *
 * // With preferences
 * {
 *   "gcsStorageKey": "virtual-staging/temp/abc123.jpg",
 *   "preferredStyle": "modern",
 *   "maxProducts": 5
 * }
 */
export class VirtualStagingRequestDto {
    /**
     * Google Cloud Storage key for internally uploaded images.
     * Use this when the image was uploaded via `/files/upload-url` endpoint.
     * Takes priority over `externalImageUrl` if both are provided.
     *
     * @example "virtual-staging/temp/abc123.jpg"
     */
    @ValidateIf((o) => !o.imageUrl && !o.externalImageUrl)
    @IsString()
    gcsStorageKey?: string;

    /**
     * @deprecated Use `gcsStorageKey` instead. Kept for backward compatibility.
     */
    @ValidateIf((o) => !o.gcsStorageKey && !o.imageUrl && !o.externalImageUrl)
    @IsString()
    imageKey?: string;

    /**
     * External HTTP/HTTPS URL for remotely hosted images.
     * Used when the image is hosted on an external service.
     *
     * @example "https://example.com/room.jpg"
     */
    @ValidateIf((o) => !o.gcsStorageKey && !o.imageKey)
    @IsUrl()
    externalImageUrl?: string;

    /**
     * @deprecated Use `externalImageUrl` instead. Kept for backward compatibility.
     */
    @ValidateIf((o) => !o.gcsStorageKey && !o.imageKey && !o.externalImageUrl)
    @IsUrl()
    imageUrl?: string;

    /**
     * Preferred interior design style for the staged room.
     * If not specified, the AI will suggest an appropriate style.
     *
     * @example "modern"
     */
    @IsOptional()
    @IsString()
    @IsIn(DESIGN_STYLES)
    preferredStyle?: string;

    /**
     * Maximum number of products to suggest from the catalog.
     * The actual visual reference images will be limited to 3.
     *
     * @default 4
     * @minimum 1
     * @maximum 20
     */
    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(VALIDATION.MAX_PRODUCTS)
    maxProducts?: number;

    /**
     * Gets the effective GCS key (supporting both new and deprecated field names).
     */
    get effectiveGcsKey(): string | undefined {
        return this.gcsStorageKey ?? this.imageKey;
    }

    /**
     * Gets the effective external URL (supporting both new and deprecated field names).
     */
    get effectiveExternalUrl(): string | undefined {
        return this.externalImageUrl ?? this.imageUrl;
    }
}

/**
 * Response DTO from virtual staging endpoint.
 *
 * Contains the complete result of the staging operation including:
 * - AI analysis of the original room
 * - Suggested products from the catalog
 * - URL of the generated staged image
 * - Processing metadata for monitoring
 */
export interface VirtualStagingResponseDto {
    /**
     * AI analysis of the original room image.
     * Includes detected room type, style, empty areas, and color palette.
     */
    analysis: RoomAnalysisResult;

    /**
     * Products from the catalog that match the staging.
     * Filtered to products with valid image URLs for visual reference.
     */
    suggestedProducts: HybridProductResult[];

    /**
     * Public URL of the generated staged image.
     * Hosted on Google Cloud Storage with long cache duration.
     */
    stagedImageUrl: string;

    /**
     * Processing metadata for monitoring and debugging.
     */
    metadata: {
        /** Total processing time in milliseconds */
        processingTimeMs: number;
        /** Number of products included in the response */
        productsFound: number;
    };
}
