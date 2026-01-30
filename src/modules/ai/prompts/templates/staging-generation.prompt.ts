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
    const imageIndex = product.index + 2; // Image 1 is the room, products start at Image 2

    return `PRODUCT #${product.index + 1} (PRIORITY ITEM):
- Name: ${product.title}
- VISUAL SOURCE: Use IMAGE ${imageIndex} strictly for COLOR, MATERIAL, and DESIGN details.
- PLACEMENT RULE:
  * Detect the room's function based on the product type.
  * If it's a SOFA/CHAIR: Orient it towards the room's focal point (TV, Window, or Fireplace).
  * If it's a BED: Headboard MUST go against a solid wall, never blocking a door.
  * If it's a TABLE: Center it in the functional area.
  * If it's STORAGE: Place flush against a wall.
- GEOMETRY: You MUST rotate and scale the object to match the perspective of Image 1 perfectly.`;
}

/**
 * Main staging prompt template builder.
 * Creates a detailed prompt for interior design AI image generation with STRUCTURAL LOCK.
 */
export function buildStagingPrompt(context: StagingPromptContext): string {
    const { analysis, products } = context;

    const productInstructions = products
        .map(buildProductInstruction)
        .join('\n\n');

    return `ROLE: You are an Architectural AI specialized in Virtual Staging and Renovation.
    
INPUT DATA:
- IMAGE 1: The "SOURCE OF TRUTH" for the room's architecture.
- IMAGES 2+: Real furniture products to be placed in the room.

OBJECTIVE:
Perform a "Virtual Staging" on Image 1. You must keep the room's shell exactly as it is but replace/add furniture using the provided products.

--------------------------------------------------------
⚠️ CRITICAL ARCHITECTURAL RULES (ZERO TOLERANCE) ⚠️
--------------------------------------------------------
1. **THE SHELL IS SACRED:** You are FORBIDDEN from changing the structural elements of Image 1.
   - DO NOT move, resize, or remove Windows or Doors.
   - DO NOT change the type of flooring (e.g., if it's wood, keep it wood).
   - DO NOT change the ceiling height or beam structure.
   - DO NOT remove built-in elements like radiators, fireplaces, or moldings.

2. **LIGHTING MATCH:** You MUST respect the natural light sources coming from the windows in Image 1. The shadows of the new furniture must match this lighting direction.

3. **DECLUTTERING LOGIC:** - If Image 1 already has furniture (e.g., an old bed, a messy desk), you must visually "REMOVE" it to make space for the new products.
   - Treat the existing furniture as "movable" and the walls/windows as "permanent".

--------------------------------------------------------
DESIGN & PLACEMENT INSTRUCTIONS
--------------------------------------------------------
STEP 1: ANALYZE THE PERSPECTIVE
- Identify the Vanishing Points of Image 1.
- All new furniture must align with these grid lines.

STEP 2: PLACE THE CATALOG PRODUCTS
${productInstructions}

STEP 3: COMPOSE THE SCENE (FILLER DECOR)
- Do not leave the selected products floating in a void.
- Act as an interior designer: Add rugs, plants, lamps, artwork, and curtains to complete the look.
- Style: ${analysis.style} matching the palette: ${analysis.colorPalette.join(', ')}.

--------------------------------------------------------
FINAL CHECKLIST
--------------------------------------------------------
- [ ] Are the windows exactly where they were in Image 1? (YES)
- [ ] Is the new furniture using the textures from Images 2+? (YES)
- [ ] Is the perspective correct? (YES)

Output ONLY the final generated image.`;
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
    version: '2.0.0', // Major update for structural integrity

    generationConfig: {
        responseModalities: ['IMAGE'],
        temperature: 0.3, // Lower temperature = Less hallucination, more adherence to image
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
        'changing walls, changing windows, changing doors, changing floor type, architectural changes, distorted perspective, floating furniture, bad shadows, low quality, cartoon, sketch, watermark, text, new room structure, room remodeling',
} as const;
