import type { RoomAnalysisResult } from '../../interfaces/vision-provider.interface';

/**
 * Virtual Staging Generation Prompt Template
 * Used by image generators to create staged room images.
 *
 * @version 1.0.0
 * @provider GeminiImageGenerator, DALL-E (compatible)
 */

/**
 * Context required to build a staging prompt.
 */
export interface StagingPromptContext {
    /** Room analysis result from vision provider */
    analysis: RoomAnalysisResult;
    /** Products to place in the room */
    products: Array<{
        title: string;
        index: number;
    }>;
    /** Whether reference images are provided */
    hasReferenceImages: boolean;
}

/**
 * Builds product placement instructions based on furniture type.
 */
function buildProductInstruction(product: { title: string; index: number }): string {
    const imageIndex = product.index + 2; // Image 1 is the room, products start at Image 2

    return `Product #${product.index + 1}:
- Item: ${product.title}
- REFERENCE SOURCE: Use IMAGE ${imageIndex} strictly for MATERIALS and COLOR.
- POSITIONING RULES: 
  * If it's a SEATING (chair, sofa): Arrange it facing the center or a focal point.
  * If it's STORAGE (wardrobe, bookshelf, cabinet): ALIGN IT AGAINST A WALL. Do not obstruct pathways.
  * If it's a TABLE (dining, coffee): Place it centrally relative to seating or the room.
  * If it's a RUG: Place it on the floor, anchoring the furniture group.
- GEOMETRY: Rotate the 3D model of the object to match the room's perspective perfectly.`;
}

/**
 * Main staging prompt template builder.
 * Creates a detailed prompt for interior design AI image generation.
 */
export function buildStagingPrompt(context: StagingPromptContext): string {
    const { analysis, products } = context;

    const productInstructions = products
        .map(buildProductInstruction)
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

/**
 * Simple staging prompt for when no reference products are available.
 */
export function buildSimpleStagingPrompt(analysis: RoomAnalysisResult, customPrompt?: string): string {
    return `You are an expert interior designer. 
        
INPUTS:
- Image 1: The EMPTY ROOM to be furnished.

TASK:
Generate a photorealistic image of the room fully furnished.

STRICT RULES:
1. PRESERVE the room's structural integrity (walls, windows, floor, lighting) from Image 1.
2. ${customPrompt || 'Furnish the room appropriately for its type.'}
3. Style: ${analysis.style || 'Modern'}.
4. Output ONLY the final generated image.`;
}

/**
 * Staging prompt configuration.
 */
export const STAGING_GENERATION_CONFIG = {
    version: '1.0.0',

    /**
     * Recommended generation config for staging.
     */
    generationConfig: {
        responseModalities: ['IMAGE'],
        temperature: 0.4,
        maxOutputTokens: 8192,
    },

    /**
     * Safety settings for image generation.
     */
    safetySettings: [
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
    ],

    /**
     * Default negative prompt to avoid common issues.
     */
    defaultNegativePrompt:
        'blurry, distorted, unrealistic, cartoon, drawing, watermark, text, signature, different color, wrong furniture',
} as const;
