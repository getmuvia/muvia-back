import { Injectable, Inject, Logger, BadRequestException } from '@nestjs/common';
import type { IVisionProvider, RoomAnalysisResult } from '../../interfaces/vision-provider.interface';
import { VISION_PROVIDER } from '../../interfaces/vision-provider.interface';
import type { IImageGenerator } from '../../interfaces/image-generator.interface';
import { IMAGE_GENERATOR } from '../../interfaces/image-generator.interface';
import { SearchService } from '../search/search.service';
import type { HybridProductResult } from '../../interfaces/search-result.interface';
import type { VirtualStagingResponseDto, VirtualStagingRequestDto } from '../../dto/virtual-staging.dto';
import { buildStagingPrompt, STAGING_GENERATION_CONFIG } from '../../prompts';
import { VIRTUAL_STAGING } from '../../constants';

/**
 * Virtual Staging Service
 *
 * Orchestrates the complete virtual staging workflow:
 * 1. Room Analysis - Uses vision AI to analyze the room image
 * 2. Product Matching - Finds relevant products from catalog
 * 3. Image Generation - Creates staged room with products
 *
 * Uses Ports & Adapters pattern for AI provider flexibility.
 */
@Injectable()
export class VirtualStagingService {
    private readonly logger = new Logger(VirtualStagingService.name);

    constructor(
        @Inject(VISION_PROVIDER)
        private readonly visionProvider: IVisionProvider,

        @Inject(IMAGE_GENERATOR)
        private readonly imageGenerator: IImageGenerator,

        private readonly searchService: SearchService,
    ) { }

    /**
     * Generates a staged room image with product recommendations.
     *
     * @param dto - Request with image source and preferences
     * @returns Staged image URL, room analysis, and product suggestions
     * @throws BadRequestException if no image source is provided
     */
    async generateStagedRoom(dto: VirtualStagingRequestDto): Promise<VirtualStagingResponseDto> {
        const startTime = Date.now();

        this.validateImageSource(dto);
        this.logger.log(`Starting virtual staging...`);

        // 1. Analyze room and find matching products
        const analysis = await this.analyzeRoomWithUrlFallback(dto);
        if (dto.preferredStyle) analysis.style = dto.preferredStyle;

        const maxProducts = dto.maxProducts ?? VIRTUAL_STAGING.DEFAULT_MAX_PRODUCTS;
        const allProducts = await this.findMatchingProducts(analysis, maxProducts);

        // 2. Filter to products with valid image URLs for visual reference
        const visualProducts = this.filterVisualProducts(allProducts);
        this.logger.debug(`Selected ${visualProducts.length} products for visual reference`);

        // 3. Generate staged image using prompt builder
        const prompt = this.buildPromptForStaging(analysis, visualProducts);
        const generatedImage = await this.generateImageWithUrlFallback(dto, prompt, visualProducts);

        const processingTimeMs = Date.now() - startTime;
        this.logger.log(`Virtual staging completed in ${processingTimeMs}ms`);

        return {
            analysis,
            suggestedProducts: visualProducts,
            stagedImageUrl: generatedImage.imageUrl,
            metadata: { processingTimeMs, productsFound: visualProducts.length },
        };
    }

    /**
     * @deprecated Use generateStagedRoom instead. Kept for backward compatibility.
     */
    async stageRoom(dto: VirtualStagingRequestDto): Promise<VirtualStagingResponseDto> {
        return this.generateStagedRoom(dto);
    }

    /**
     * Validates that at least one image source is provided.
     */
    private validateImageSource(dto: VirtualStagingRequestDto): void {
        const gcsKey = dto.gcsStorageKey ?? dto.imageKey;
        const externalUrl = dto.externalImageUrl ?? dto.imageUrl;

        if (!gcsKey && !externalUrl) {
            throw new BadRequestException('Either gcsStorageKey/imageKey or externalImageUrl/imageUrl must be provided');
        }
    }

    /**
     * Gets the effective GCS key from DTO (supports legacy field names).
     */
    private getGcsKey(dto: VirtualStagingRequestDto): string | undefined {
        return dto.gcsStorageKey ?? dto.imageKey;
    }

    /**
     * Gets the effective external URL from DTO (supports legacy field names).
     */
    private getExternalUrl(dto: VirtualStagingRequestDto): string | undefined {
        return dto.externalImageUrl ?? dto.imageUrl;
    }

    /**
     * Filters products to only those with valid HTTP/HTTPS image URLs.
     */
    private filterVisualProducts(products: HybridProductResult[]): HybridProductResult[] {
        return products
            .filter(p => p.imageUrl && (p.imageUrl.startsWith('http://') || p.imageUrl.startsWith('https://')))
            .slice(0, VIRTUAL_STAGING.MAX_REFERENCE_IMAGES);
    }

    /**
     * Builds the staging prompt using the centralized prompt builder.
     */
    private buildPromptForStaging(
        analysis: RoomAnalysisResult,
        products: HybridProductResult[],
    ): string {
        return buildStagingPrompt({
            analysis,
            products: products.map((p, index) => ({ title: p.title, index })),
            hasReferenceImages: products.length > 0,
        });
    }

    /**
     * Analyzes the room image, falling back to URL if GCS key fails.
     */
    private async analyzeRoomWithUrlFallback(dto: VirtualStagingRequestDto): Promise<RoomAnalysisResult> {
        const gcsKey = this.getGcsKey(dto);
        const externalUrl = this.getExternalUrl(dto);

        if (gcsKey) {
            try {
                this.logger.debug(`Analyzing room via GCS key: ${gcsKey}`);
                return await this.visionProvider.analyzeRoom({ key: gcsKey });
            } catch (error) {
                this.logger.warn(`GCS key analysis failed: ${error.message}`);
                if (externalUrl) {
                    this.logger.debug(`Falling back to URL analysis`);
                    return await this.visionProvider.analyzeRoom({ url: externalUrl });
                }
                throw error;
            }
        }
        return await this.visionProvider.analyzeRoom({ url: externalUrl });
    }

    /**
     * Generates staged image, with URL fallback if GCS key fails.
     */
    private async generateImageWithUrlFallback(
        dto: VirtualStagingRequestDto,
        prompt: string,
        visualProducts: HybridProductResult[],
    ) {
        const gcsKey = this.getGcsKey(dto);
        const externalUrl = this.getExternalUrl(dto);

        const referenceImages: string[] = visualProducts.map(p => p.imageUrl as string);
        const baseRequest = {
            prompt,
            style: 'photorealistic' as const,
            negativePrompt: STAGING_GENERATION_CONFIG.defaultNegativePrompt,
            referenceImages,
        };

        if (gcsKey) {
            try {
                return await this.imageGenerator.generate({ ...baseRequest, imageSource: { key: gcsKey } });
            } catch (error) {
                this.logger.warn(`GCS key generation failed, falling back to URL...`);
            }
        }
        return await this.imageGenerator.generate({ ...baseRequest, imageSource: { url: externalUrl } });
    }

    /**
     * Finds products matching the room analysis.
     */
    private async findMatchingProducts(
        analysis: RoomAnalysisResult,
        maxProducts: number,
    ): Promise<HybridProductResult[]> {
        const queries = this.buildSearchQueries(analysis);
        const searchResults = await Promise.all(
            queries.map(query => this.searchService.searchHybrid({ query, limit: VIRTUAL_STAGING.SEARCH_RESULTS_PER_QUERY })),
        );
        return this.mergeAndRankProducts(searchResults, maxProducts);
    }

    /**
     * Builds search queries from room analysis.
     * Combines furniture type with style and primary color.
     */
    private buildSearchQueries(analysis: RoomAnalysisResult): string[] {
        const { suggestedFurniture, style, colorPalette } = analysis;
        const primaryColor = colorPalette[0] || '';
        return suggestedFurniture
            .slice(0, VIRTUAL_STAGING.MAX_FURNITURE_QUERIES)
            .map(furniture => `${furniture} ${style} ${primaryColor}`.trim());
    }

    /**
     * Merges and ranks products from multiple search results.
     * Removes duplicates and sorts by score.
     */
    private mergeAndRankProducts(
        searchResults: Array<{ results: HybridProductResult[] }>,
        maxProducts: number,
    ): HybridProductResult[] {
        const seen = new Set<string>();
        const merged: HybridProductResult[] = [];
        for (const result of searchResults) {
            for (const product of result.results) {
                if (!seen.has(product.id)) {
                    seen.add(product.id);
                    merged.push(product);
                }
            }
        }
        return merged.sort((a, b) => b.score - a.score).slice(0, maxProducts);
    }
}
