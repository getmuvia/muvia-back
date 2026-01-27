import { IsOptional, IsString, IsIn, IsUrl, IsNumber, Min, Max, ValidateIf } from 'class-validator';
import type { RoomAnalysisResult } from '../interfaces/vision-provider.interface';
import type { HybridProductResult } from '../interfaces/search-result.interface';

export class VirtualStagingRequestDto {
    /**
     * Internal storage key (Google Cloud Storage path).
     * Use this when the image was uploaded via /files/upload-url.
     * @example "virtual-staging/temp/123.jpg"
     */
    @ValidateIf((o) => !o.imageUrl)
    @IsString()
    imageKey?: string;

    /**
     * External image URL.
     * Use this when the image is hosted externally.
     * @example "https://example.com/room.jpg"
     */
    @ValidateIf((o) => !o.imageKey)
    @IsUrl()
    imageUrl?: string;

    @IsOptional()
    @IsString()
    @IsIn(['modern', 'minimalist', 'rustic', 'industrial', 'scandinavian', 'bohemian', 'traditional'])
    preferredStyle?: string;

    /**
     * Maximum number of products to suggest.
     * @default 10
     */
    @IsOptional()
    @IsNumber()
    @Min(1)
    @Max(20)
    maxProducts?: number;
}

/**
 * Response from virtual staging endpoint.
 */
export interface VirtualStagingResponseDto {
    /** Analysis of the original room */
    analysis: RoomAnalysisResult;

    /** Products from catalog that match the staging */
    suggestedProducts: HybridProductResult[];

    /** URL of the generated staged image */
    stagedImageUrl: string;

    /** Processing metadata */
    metadata: {
        processingTimeMs: number;
        productsFound: number;
    };
}
