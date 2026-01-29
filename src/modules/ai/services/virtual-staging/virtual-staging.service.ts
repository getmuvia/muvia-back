import { Injectable, Inject, Logger, BadRequestException } from '@nestjs/common';
import type { IVisionProvider, RoomAnalysisResult } from '../../interfaces/vision-provider.interface';
import { VISION_PROVIDER } from '../../interfaces/vision-provider.interface';
import type { IImageGenerator } from '../../interfaces/image-generator.interface';
import { IMAGE_GENERATOR } from '../../interfaces/image-generator.interface';
import { SearchService } from '../search/search.service';
import type { HybridProductResult } from '../../interfaces/search-result.interface';
import type { VirtualStagingResponseDto, VirtualStagingRequestDto } from '../../dto/virtual-staging.dto';

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

    async stageRoom(dto: VirtualStagingRequestDto): Promise<VirtualStagingResponseDto> {
        const startTime = Date.now();

        if (!dto.imageKey && !dto.imageUrl) {
            throw new BadRequestException('Either imageKey or imageUrl must be provided');
        }

        this.logger.log(`Starting virtual staging...`);

        // 1. Analizar Sala
        const analysis = await this.analyzeRoomWithFallback(dto);
        if (dto.preferredStyle) analysis.style = dto.preferredStyle;

        // 2. Buscar Productos
        const maxProducts = dto.maxProducts ?? 4;
        const allProducts = await this.findMatchingProducts(analysis, maxProducts);

        // 3. 🔥 FILTRADO CRÍTICO: Solo usamos productos con imagen válida para el staging visual
        // Esto evita que el texto y las imágenes se desfasen
        const visualProducts = allProducts
            .filter(p => p.imageUrl && p.imageUrl.startsWith('http'))
            .slice(0, 3); // Nos quedamos con los 3 mejores QUE TENGAN FOTO

        this.logger.debug(`Selected ${visualProducts.length} products with valid images for generation`);

        // 4. Generar Prompt Sincronizado
        const prompt = this.buildGenerationPrompt(analysis, visualProducts);

        // 5. Generar Imagen
        const generatedImage = await this.generateImageWithFallback(dto, prompt, visualProducts);

        const processingTimeMs = Date.now() - startTime;
        this.logger.log(`Virtual staging completed in ${processingTimeMs}ms`);

        return {
            analysis,
            suggestedProducts: visualProducts, // Devolvemos los que realmente se usaron
            stagedImageUrl: generatedImage.imageUrl,
            metadata: {
                processingTimeMs,
                productsFound: visualProducts.length,
            },
        };
    }

    // ... (analyzeRoomWithFallback se mantiene igual) ...
    private async analyzeRoomWithFallback(dto: VirtualStagingRequestDto): Promise<RoomAnalysisResult> {
        if (dto.imageKey) {
            try {
                this.logger.debug(`Analyzing room via imageKey: ${dto.imageKey}`);
                return await this.visionProvider.analyzeRoom({ key: dto.imageKey });
            } catch (error) {
                this.logger.warn(`imageKey failed: ${error.message}`);
                if (dto.imageUrl) return await this.visionProvider.analyzeRoom({ url: dto.imageUrl });
                throw error;
            }
        }
        return await this.visionProvider.analyzeRoom({ url: dto.imageUrl });
    }

    /**
     * Generates image passing the strictly filtered product images.
     */
    private async generateImageWithFallback(
        dto: VirtualStagingRequestDto,
        prompt: string,
        visualProducts: HybridProductResult[],
    ) {
        // Extraemos las URLs limpias (ya sabemos que existen por el filtro anterior)
        const referenceImages = visualProducts.map(p => p.imageUrl as string);

        const baseRequest = {
            prompt,
            style: 'photorealistic' as const,
            negativePrompt: 'blurry, distorted, unrealistic, cartoon, drawing, watermark, text, signature',
            referenceImages,
        };

        // Priority 1: Try with imageKey
        if (dto.imageKey) {
            try {
                return await this.imageGenerator.generate({
                    ...baseRequest,
                    imageSource: { key: dto.imageKey },
                });
            } catch (error) {
                this.logger.warn(`imageKey generation failed, trying URL fallback...`);
            }
        }

        // Fallback
        return await this.imageGenerator.generate({
            ...baseRequest,
            imageSource: { url: dto.imageUrl },
        });
    }

    // ... (findMatchingProducts, buildSearchQueries, mergeAndRankProducts se mantienen igual) ...
    private async findMatchingProducts(analysis: RoomAnalysisResult, maxProducts: number): Promise<HybridProductResult[]> {
        const queries = this.buildSearchQueries(analysis);
        const searchResults = await Promise.all(queries.map(query => this.searchService.searchHybrid({ query, limit: 5 })));
        return this.mergeAndRankProducts(searchResults, maxProducts);
    }

    private buildSearchQueries(analysis: RoomAnalysisResult): string[] {
        const { suggestedFurniture, style, colorPalette } = analysis;
        const primaryColor = colorPalette[0] || '';
        return suggestedFurniture.slice(0, 3).map(furniture => `${furniture} ${style} ${primaryColor}`.trim());
    }

    private mergeAndRankProducts(searchResults: Array<{ results: HybridProductResult[] }>, maxProducts: number): HybridProductResult[] {
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

    /**
     * Build prompt with EXPLICIT IMAGE MAPPING.
     */
    private buildGenerationPrompt(
        analysis: RoomAnalysisResult,
        products: HybridProductResult[],
    ): string {
        // 🔥 MAPEO EXPLÍCITO: Le decimos a la IA qué imagen es cada producto
        // La Imagen 1 siempre es la Sala.
        // Por tanto, el producto 0 es la Imagen 2, el producto 1 es la Imagen 3, etc.
        const productInstructions = products
            .map((p, index) => {
                const imageIndex = index + 2; // +2 porque Image 1 = Sala
                return `Product #${index + 1} (REFER TO IMAGE ${imageIndex}):
- Item: ${p.title}
- Visual Reference: USE IMAGE ${imageIndex} provided in the context.
- Description: ${p.description || 'Modern furniture style'}
- Placement: Place naturally in the scene.`;
            })
            .join('\n\n');

        return `Create a photorealistic interior design render of this ${analysis.roomType}.

CONTEXT:
- Image 1 provided is the EMPTY ROOM (Base).
- Subsequent images (Image 2, Image 3...) are the REAL FURNITURE to be placed.

Design Style: ${analysis.style}
Color Palette: ${analysis.colorPalette.join(', ')}

INSTRUCTIONS:
You must furnish the room (Image 1) using strictly the following visual references:

${productInstructions}

CRITICAL REQUIREMENTS:
1. Maintain the room structure (Image 1) exactly (walls, floor, windows).
2. For each furniture piece listed above, LOOK AT ITS CORRESPONDING REFERENCE IMAGE and transfer its visual appearance (color, material, shape) into the room.
3. If the reference image is a product shot on white background, blend it realistically into the room lighting and perspective.
4. Output ONLY the final staged image.`;
    }
}
