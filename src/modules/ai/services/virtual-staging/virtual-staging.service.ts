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
        if (!dto.imageKey && !dto.imageUrl) throw new BadRequestException('Either imageKey or imageUrl must be provided');
        this.logger.log(`Starting virtual staging...`);

        // 1. Analizar y Buscar
        const analysis = await this.analyzeRoomWithFallback(dto);
        if (dto.preferredStyle) analysis.style = dto.preferredStyle;
        const maxProducts = dto.maxProducts ?? 4;
        const allProducts = await this.findMatchingProducts(analysis, maxProducts);

        // 2. FILTRADO CRÍTICO: Solo productos visuales
        const visualProducts = allProducts
            .filter(p => p.imageUrl && p.imageUrl.startsWith('http'))
            .slice(0, 3);

        this.logger.debug(`Selected ${visualProducts.length} products for visual reference`);

        // 3. Generar el "Super Prompt" (Nueva Lógica)
        const prompt = this.buildGenerationPrompt(analysis, visualProducts);

        // 4. Generar Imagen
        const generatedImage = await this.generateImageWithFallback(dto, prompt, visualProducts);

        const processingTimeMs = Date.now() - startTime;
        this.logger.log(`Virtual staging completed in ${processingTimeMs}ms`);

        return {
            analysis,
            suggestedProducts: visualProducts,
            stagedImageUrl: generatedImage.imageUrl,
            metadata: { processingTimeMs, productsFound: visualProducts.length },
        };
    }

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
    private async generateImageWithFallback(dto: VirtualStagingRequestDto, prompt: string, visualProducts: HybridProductResult[]) {
        const referenceImages: string[] = visualProducts.map(p => p.imageUrl as string);
        const baseRequest = {
            prompt,
            style: 'photorealistic' as const,
            negativePrompt: 'blurry, distorted, unrealistic, cartoon, drawing, watermark, text, signature, different color, wrong furniture',
            referenceImages,
        };
        if (dto.imageKey) {
            try {
                return await this.imageGenerator.generate({ ...baseRequest, imageSource: { key: dto.imageKey } });
            } catch (error) {
                this.logger.warn(`imageKey generation failed, trying URL fallback...`);
            }
        }
        return await this.imageGenerator.generate({ ...baseRequest, imageSource: { url: dto.imageUrl } });
    }

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
        // Mapeo explícito de imágenes.
        // SABOTAJE: Usamos solo el título, eliminamos la descripción conflictiva.
        const productInstructions = products
            .map((p, index) => {
                const imageIndex = index + 2; // Image 1 = Sala
                return `Product #${index + 1}:
- Type: ${p.title} (e.g., Office Chair, Sofa)
- VISUAL SOURCE: YOU MUST USE IMAGE ${imageIndex}.
- INSTRUCTION: Replicate the exact object shown in IMAGE ${imageIndex} (color, shape, materials) and place it realistically in the room.`;
            })
            .join('\n\n');

        return `TASK: Furnish the empty room (Image 1) using the provided product reference images.

CONTEXT:
- Image 1: Empty Room (Base).
- Image 2, 3, 4...: REAL FURNITURE to be placed.

STRICT VISUAL INSTRUCTIONS:
The text descriptions of the products might be inaccurate. **IGNORE any text descriptions** that contradict the visual evidence in the reference images. 

Your primary source of truth for the furniture appearance is **THE PIXELS IN THE REFERENCE IMAGES**.

${productInstructions}

EXECUTION STEPS:
1. Start with the room in Image 1.
2. For each Product listed above, look at its designated REFERENCE IMAGE.
3. visually "cut out" the object from its reference image.
4. "Paste" it realistically into the room (Image 1), adjusting lighting and shadows to match the scene.
5. Do NOT change the color or design of the furniture from what is seen in its reference image.

Style: ${analysis.style}
Output ONLY the final image.`;
    }
}
