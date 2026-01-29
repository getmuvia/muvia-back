import { Injectable, Inject, Logger, BadRequestException } from '@nestjs/common';
import type { IVisionProvider, RoomAnalysisResult } from '../../interfaces/vision-provider.interface';
import { VISION_PROVIDER } from '../../interfaces/vision-provider.interface';
import type { IImageGenerator } from '../../interfaces/image-generator.interface';
import { IMAGE_GENERATOR } from '../../interfaces/image-generator.interface';
import { SearchService } from '../search/search.service';
import type { HybridProductResult } from '../../interfaces/search-result.interface';
import type { VirtualStagingResponseDto, VirtualStagingRequestDto } from '../../dto/virtual-staging.dto';

/**
 * Orchestrates the virtual staging workflow.
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
     * Process a room image and return staged version with product suggestions.
     */
    async stageRoom(dto: VirtualStagingRequestDto): Promise<VirtualStagingResponseDto> {
        const startTime = Date.now();

        // Validate input
        if (!dto.imageKey && !dto.imageUrl) {
            throw new BadRequestException('Either imageKey or imageUrl must be provided');
        }

        this.logger.log(`Starting virtual staging...`);

        const analysis = await this.analyzeRoomWithFallback(dto);

        if (dto.preferredStyle) {
            analysis.style = dto.preferredStyle;
        }

        const maxProducts = dto.maxProducts ?? 4;
        const products = await this.findMatchingProducts(analysis, maxProducts);

        const prompt = this.buildGenerationPrompt(analysis, products);

        // 🔥 ACTUALIZADO: Pasamos los productos reales para usar sus imágenes
        const generatedImage = await this.generateImageWithFallback(dto, prompt, products);

        const processingTimeMs = Date.now() - startTime;
        this.logger.log(`Virtual staging completed in ${processingTimeMs}ms`);

        return {
            analysis,
            suggestedProducts: products,
            stagedImageUrl: generatedImage.imageUrl,
            metadata: {
                processingTimeMs,
                productsFound: products.length,
            },
        };
    }

    /**
     * Analyzes room with fallback strategy:
     * 1. Try imageKey (gs://) if present
     * 2. If fails and imageUrl exists, fallback to URL
     * 3. If both fail or no fallback available, throw error
     */
    private async analyzeRoomWithFallback(dto: VirtualStagingRequestDto): Promise<RoomAnalysisResult> {
        if (dto.imageKey) {
            try {
                this.logger.debug(`Analyzing room via imageKey: ${dto.imageKey}`);
                return await this.visionProvider.analyzeRoom({ key: dto.imageKey });
            } catch (error) {
                this.logger.warn(`imageKey failed: ${error.message}`);

                // Fallback to URL if available
                if (dto.imageUrl) {
                    this.logger.debug(`Falling back to imageUrl: ${dto.imageUrl}`);
                    return await this.visionProvider.analyzeRoom({ url: dto.imageUrl });
                }

                throw error;
            }
        }

        this.logger.debug(`Analyzing room via imageUrl: ${dto.imageUrl}`);
        return await this.visionProvider.analyzeRoom({ url: dto.imageUrl });
    }

    /**
     * Generates image with fallback strategy (same as analyzeRoom).
     * NOW supports reference images from products.
     */
    private async generateImageWithFallback(
        dto: VirtualStagingRequestDto,
        prompt: string,
        products: HybridProductResult[],
    ) {
        // 🔥 CORRECCIÓN TYPESCRIPT: Forzamos el tipo string[] eliminando nulos explícitamente
        const referenceImages: string[] = products
            .map(p => p.imageUrl)
            .filter((url): url is string => typeof url === 'string' && url.length > 0)
            .slice(0, 3);

        const baseRequest = {
            prompt,
            style: 'photorealistic' as const,
            negativePrompt: 'blurry, distorted, unrealistic, cartoon, drawing, watermark, text, signature',
            referenceImages,
        };

        // Priority 1: Try with imageKey
        if (dto.imageKey) {
            try {
                this.logger.debug(`Generating image via imageKey: ${dto.imageKey}`);
                return await this.imageGenerator.generate({
                    ...baseRequest,
                    imageSource: { key: dto.imageKey },
                });
            } catch (error) {
                this.logger.warn(`imageKey failed for generation: ${error.message}`);

                // Fallback to URL if available
                if (dto.imageUrl) {
                    this.logger.debug(`Falling back to imageUrl for generation`);
                    return await this.imageGenerator.generate({
                        ...baseRequest,
                        imageSource: { url: dto.imageUrl },
                    });
                }

                throw error;
            }
        }

        // Only imageUrl provided
        return await this.imageGenerator.generate({
            ...baseRequest,
            imageSource: { url: dto.imageUrl },
        });
    }

    /**
     * Step 2: Search for matching products using hybrid search.
     */
    private async findMatchingProducts(
        analysis: RoomAnalysisResult,
        maxProducts: number,
    ): Promise<HybridProductResult[]> {
        this.logger.debug('Searching for matching products...');

        // Build search queries from analysis
        const queries = this.buildSearchQueries(analysis);

        // Execute searches in parallel
        const searchResults = await Promise.all(
            queries.map(query =>
                this.searchService.searchHybrid({ query, limit: 5 }),
            ),
        );

        // Merge and deduplicate results
        const products = this.mergeAndRankProducts(searchResults, maxProducts);

        this.logger.debug(`Found ${products.length} matching products`);
        return products;
    }

    /**
     * Build search queries from room analysis.
     * Combines furniture suggestions with style and color context.
     */
    private buildSearchQueries(analysis: RoomAnalysisResult): string[] {
        const { suggestedFurniture, style, colorPalette } = analysis;
        const primaryColor = colorPalette[0] || '';

        this.logger.debug(`Generating search queries for ${suggestedFurniture.length} items`);

        return suggestedFurniture.slice(0, 3).map(furniture => {
            return `${furniture} ${style} ${primaryColor}`.trim();
        });
    }

    /**
     * Merge search results, remove duplicates, and rank by score.
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

        // Sort by score descending and limit
        return merged
            .sort((a, b) => b.score - a.score)
            .slice(0, maxProducts);
    }

    /**
     * Build the prompt for image generation.
     * Includes room context and actual product information.
     */
    private buildGenerationPrompt(
        analysis: RoomAnalysisResult,
        products: HybridProductResult[],
    ): string {
        const productDescriptions = products
            .slice(0, 3)
            .map(p => `- ${p.title}: ${p.description || ''}`)
            .join('\n');

        return `Create a photorealistic interior design render of this ${analysis.roomType}.

Design Style: ${analysis.style}
Color Palette: ${analysis.colorPalette.join(', ')}

Place furniture naturally in these areas: ${analysis.emptyAreas.join(', ')}

The user has selected these specific REAL products to be placed in the room (reference images provided):
${productDescriptions}

Requirements:
- Maintain the original room's architecture, windows, and lighting from the first image.
- USE THE VISUAL STYLE AND COLOR of the provided product reference images for the furniture.
- Photorealistic quality suitable for e-commerce.
- Natural furniture placement with proper scale.
- Cohesive design that matches the ${analysis.style} aesthetic.`;
    }
}
