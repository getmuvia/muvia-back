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
        const productInstructions = products
            .map((p, index) => {
                const imageIndex = index + 2;
                // AQUÍ ESTÁ LA CLAVE: Instrucciones dinámicas según el tipo de mueble
                return `Product #${index + 1}:
- Item: ${p.title}
- REFERENCE SOURCE: Use IMAGE ${imageIndex} strictly for MATERIALS and COLOR.
- POSITIONING RULES: 
  * If it's a SEATING (chair, sofa): Arrange it facing the center or a focal point.
  * If it's STORAGE (wardrobe, bookshelf, cabinet): ALIGN IT AGAINST A WALL. Do not obstruct pathways.
  * If it's a TABLE (dining, coffee): Place it centrally relative to seating or the room.
  * If it's a RUG: Place it on the floor, anchoring the furniture group.
- GEOMETRY: Rotate the 3D model of the object to match the room's perspective perfectly.`;
            })
            .join('\n\n');

        return `TASK: Act as an expert 3D Interior Designer. Furnish the empty room (Image 1) creating a realistic, lived-in scene.

CONTEXT:
- Image 1: The Base Room (Perspective and lighting reference).
- Subsequent Images: The Furniture Catalogue (Material and Design reference).

INSTRUCTIONS FOR "SMART STAGING":

1. **ANALYZE THE PERSPECTIVE:** Look at the floor lines and walls of Image 1. All inserted furniture MUST align with these vanishing points.

2. **PLACE THE KEY PRODUCTS (INTELLIGENTLY):**
${productInstructions}

   **CRITICAL RULE FOR PRODUCTS:** - You MUST keep the visual identity (Color, Fabric, Style) from the reference images.
   - BUT you MUST CHANGE the 3D rotation and angle to match the new position in the room.

3. **CREATE THE SCENE (CONTEXTUAL FILL):**
   - Don't just leave the products isolated. Create a logical environment for them.
   - **For Seating:** Generate appropriate tables or complementary seating nearby.
   - **For Tables:** Add centerpieces, chairs, or placement settings.
   - **For Storage/Shelves:** Add books, plants, or decor items inside/on top to make it look used.
   - **For Bedroom items:** Ensure proper orientation relative to the "bed" wall.
   
   Add ambient decor: Plants, lamps, art, and soft shadows to ground the objects.

STRICT CONSTRAINTS:
- ✅ YES: Rotate objects, change perspective, create supporting furniture.
- ✅ YES: Add decoration (plants, rugs) to make it cozy.
- ❌ NO: Do NOT change the architectural shell (walls/windows) of Image 1.
- ❌ NO: Do NOT change the COLOR or MATERIAL of the Key Products.

Style: ${analysis.style}. Lighting: Natural and soft.
Output ONLY the final image.`;
    }
}
