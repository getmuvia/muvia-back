import { IsOptional, IsString, IsIn, IsUrl, IsUUID } from 'class-validator';
import type { RoomAnalysisResult } from '../interfaces/vision-provider.interface';
import { DESIGN_STYLES } from '../constants';

/**
 * Request DTO for virtual staging endpoint.
 *
 * Requires either `gcsStorageKey` (for internally uploaded images) or
 * `externalImageUrl` (for externally hosted images). At least one must be provided.
 *
 * @example
 * // Using GCS storage key (recommended for uploaded images)
 * {
 *   "gcsStorageKey": "virtual-staging/temp/abc123.jpg",
 *   "productId": "2ebbb0f8-6ef5-4bcb-9fcb-7e4afb1b418a"
 * }
 *
 * // Using external URL
 * {
 *   "externalImageUrl": "https://example.com/room.jpg",
 *   "productId": "2ebbb0f8-6ef5-4bcb-9fcb-7e4afb1b418a"
 * }
 *
 * // With preferences
 * {
 *   "gcsStorageKey": "virtual-staging/temp/abc123.jpg",
 *   "productId": "2ebbb0f8-6ef5-4bcb-9fcb-7e4afb1b418a",
 *   "preferredStyle": "modern"
 * }
 */
export class VirtualStagingRequestDto {
    /** Catalog product explicitly selected by the user for this generation. */
    @IsUUID()
    productId: string;

    /**
     * Google Cloud Storage key for internally uploaded images.
     * Use this when the image was uploaded via `/files/upload-url` endpoint.
     * Takes priority over `externalImageUrl` if both are provided.
     *
     * @example "virtual-staging/temp/abc123.jpg"
     */
    @IsOptional()
    @IsString()
    gcsStorageKey?: string;

    /**
     * @deprecated Use `gcsStorageKey` instead. Kept for backward compatibility.
     */
    @IsOptional()
    @IsString()
    imageKey?: string;

    /**
     * External HTTP/HTTPS URL for remotely hosted images.
     * Used when the image is hosted on an external service.
     *
     * @example "https://example.com/room.jpg"
     */
    @IsOptional()
    @IsUrl()
    externalImageUrl?: string;

    /**
     * @deprecated Use `externalImageUrl` instead. Kept for backward compatibility.
     */
    @IsOptional()
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

export interface VirtualStagingQuotaDto {
    /** Maximum number of generations available per Bolivia calendar day. */
    limit: number;

    /** Number of generations still available today. */
    remaining: number;
}

/** Product from the catalog used as the visual reference for a generation. */
export interface VirtualStagingProductDto {
    id: string;
    title: string;
    description: string | null;
    price: number;
    imageUrl: string;
}

/**
 * Response DTO from virtual staging endpoint.
 *
 * Contains the complete result of the staging operation including:
 * - AI analysis of the original room
 * - Product selected from the catalog
 * - URL of the generated staged image
 * - Processing metadata for monitoring
 */
export interface VirtualStagingResponseDto {
    /**
     * AI analysis of the original room image.
     * Includes detected room type, style, empty areas, and color palette.
     */
    analysis: RoomAnalysisResult;

    /** Product explicitly selected by the user and used for this staging. */
    selectedProduct: VirtualStagingProductDto;

    /**
     * Public URL of the generated staged image.
     * Hosted on Google Cloud Storage with long cache duration.
     */
    stagedImageUrl: string;

    /** Updated quota after completing this generation. */
    quota: VirtualStagingQuotaDto;

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
