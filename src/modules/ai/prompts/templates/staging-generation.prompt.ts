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
 * Includes explicit rules for placement and scale.
 */
function buildProductInstruction(product: { title: string; index: number }): string {
    const imageIndex = product.index + 2;

    return `ASSET #${product.index + 1} (SOURCE: IMAGE ${imageIndex}):
- **ITEM IDENTITY:** "${product.title}"
- **EXTRACTION RULE:** Look at Image ${imageIndex}. IGNORE the background, the floor, and any other items in that photo. Mentally "crop" ONLY the ${product.title}.
- **PLACEMENT IN ROOM (IMAGE 1):** * Take this "cropped" item and place it into the perspective of Image 1.
  * Scale it realistically relative to the ceiling height of Image 1.
  * If the product is a sofa/bed, place it where the main furniture logically belongs in Image 1.`;
}

/**
 * Main staging prompt template builder.
 * Creates a detailed prompt for interior design AI image generation with STRUCTURAL LOCK.
 */
export function buildStagingPrompt(context: StagingPromptContext): string {
    const { analysis, products } = context;
    const productInstructions = products.map(buildProductInstruction).join('\n\n');

    return `ROLE: You are an expert Interior Design AI specialized in "In-Painting" and Compositing.

--------------------------------------------------------
📸 INPUT IMAGE ROLES (CRITICAL)
--------------------------------------------------------
**IMAGE 1 = THE CANVAS (THE ONLY ROOM)**
- This is the ONLY space you are allowed to render. 
- You must keep its walls, floor, windows, and lighting exactly as they are.
- If Image 1 is NOT empty, you must virtually "remove" existing clutter/furniture to make space.

**IMAGES 2+ = THE WAREHOUSE (FURNITURE CATALOG)**
- These images are ONLY to show you what the furniture looks like.
- **WARNING:** The backgrounds in Images 2+ are FAKE settings. DO NOT COPY them. DO NOT let them influence the room's walls or floor.
- Extract ONLY the furniture object defined in the description.

--------------------------------------------------------
🏗️ EXECUTION STEPS
--------------------------------------------------------
STEP 1: ANALYZE THE CANVAS (IMAGE 1)
- Map the perspective grid of Image 1.
- Identify the light direction in Image 1 (look at the windows).
- Detect architectural limits: Walls, Pillars, Door frames. These are IMMUTABLE.

STEP 2: PREPARE THE SPACE
- Does Image 1 have old furniture? -> Visually remove it (inpainting) to clear the floor.
- Does Image 1 have a messy floor? -> Clean it virtually, keeping the original flooring material.

STEP 3: INSERT THE ASSETS
${productInstructions}

STEP 4: HARMONIZATION
- Cast shadows from the new furniture onto the floor of Image 1.
- The shadow direction MUST match the light coming from the windows in Image 1.
- Color Correction: Adjust the furniture brightness/contrast to match the ambient light of Image 1.

--------------------------------------------------------
🎨 FINAL STYLE GUIDE
--------------------------------------------------------
- Room Style: ${analysis.style}
- Palette: ${analysis.colorPalette.join(', ')}
- Decor: Add subtle accessories (plants, rugs, lamps) to bind the scene, but keep the focus on the provided products.

OUTPUT:
Generate a photorealistic image that looks exactly like IMAGE 1, but furnished with the items from IMAGES 2+.`;
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
    version: '2.1.0',

    generationConfig: {
        responseModalities: ['IMAGE'],
        temperature: 0.35,
        maxOutputTokens: 8192,
    },

    safetySettings: [
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
    ],

    /**
     * Enhanced negative prompt to prevent structural changes.
     */
    defaultNegativePrompt:
        'changing walls, changing windows, changing doors, changing floor type, architectural changes, distorted perspective, floating furniture, bad shadows, low quality, cartoon, sketch, watermark, text, new room structure, room remodeling, merging backgrounds, changing room structure, changing windows, changing flooring, messy, distorted perspective, flying furniture, bad shadows, low quality, copying background from catalog images',
} as const;
