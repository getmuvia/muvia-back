import type { RoomAnalysisResult } from '../../interfaces/vision-provider.interface';

/**
 * Virtual Staging Generation Prompt Template
 * Used by image generators to create professionally staged room images.
 *
 * @version 2.0.0
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
 * Builds product description for the prompt.
 */
function buildProductDescription(product: { title: string; index: number }): string {
    const imageIndex = product.index + 2;
    return `  - **"${product.title}"** (see IMAGE ${imageIndex}): Extract this item visually, adapt its angle/size to fit the room's perspective.`;
}

/**
 * Main staging prompt template builder.
 * Creates a detailed prompt for CREATIVE interior design with product integration.
 */
export function buildStagingPrompt(context: StagingPromptContext): string {
    const { analysis, products } = context;
    const productList = products.map(buildProductDescription).join('\n');
    const productNames = products.map(p => p.title).join(', ');

    return `🎨 ROLE: You are a CREATIVE PROFESSIONAL INTERIOR DESIGNER with expertise in virtual staging.

You are NOT just placing furniture - you are designing a COMPLETE, HARMONIOUS living space that feels professionally decorated and magazine-worthy.

════════════════════════════════════════════════════════════════════
📸 INPUT IMAGES
════════════════════════════════════════════════════════════════════

**IMAGE 1 = THE EMPTY CANVAS**
- This is the room you must transform into a beautifully decorated space.
- TRANSFORM: Remove any existing clutter or old furniture to make space for your design.

**IMAGES 2, 3, 4... = ANCHOR PRODUCTS (YOUR INSPIRATION)**
- These are REAL products that MUST appear in your final design.
- They are your "anchor pieces" - the starting point for a complete decoration.
${productList}

════════════════════════════════════════════════════════════════════
🚫 IMMUTABLE ELEMENTS - DO NOT MODIFY UNDER ANY CIRCUMSTANCES
════════════════════════════════════════════════════════════════════

These elements are FIXED CONSTRUCTION and must remain EXACTLY as shown in IMAGE 1:

**STRUCTURAL ELEMENTS (OBRA BRUTA):**
- Wall positions, angles, and colors (unless you're adding accent paint)
- Ceiling height, shape, and angle (including sloped/vaulted ceilings)
- Floor material, pattern, and color (keep original wood, tile, carpet, etc.)
- Window positions, sizes, and frames
- Door positions, sizes, and frames
- Pillars, columns, and beams
- Built-in shelves, fireplaces, or niches

**PERSPECTIVE & DIMENSIONS:**
- The camera angle must remain IDENTICAL to IMAGE 1
- Room dimensions must appear the same (don't make it look larger or smaller)
- Vanishing points and perspective lines must match exactly
- The aspect ratio of the output must match IMAGE 1

**LIGHTING SOURCES:**
- Natural light direction from windows must be preserved
- Existing ceiling fixtures positions (you can update the fixture style)
- Shadow directions must match the original light sources

════════════════════════════════════════════════════════════════════
🎯 YOUR CREATIVE MISSION
════════════════════════════════════════════════════════════════════

Create a COMPLETE interior design using the ${products.length} anchor products as the foundation.

**MANDATORY RULES FOR ANCHOR PRODUCTS:**
1. Each anchor product (${productNames}) MUST be clearly visible in the final image.
2. Extract ONLY the furniture/object from each reference image - IGNORE their backgrounds completely.
3. Adapt each product's SIZE, ANGLE, and PERSPECTIVE to match Image 1's viewpoint.
4. Place each product in a LOGICAL position (e.g., chairs near tables, sofas facing TVs).

**YOUR CREATIVE FREEDOM - BE A DESIGNER, NOT A COPY MACHINE:**
1. **ADD COMPLEMENTARY FURNITURE**: If you place an office chair, add a desk. If there's a sofa, add a coffee table. If there's a bed, add nightstands.
2. **DUPLICATE WHEN IT MAKES SENSE**: Place multiple plants, matching cushions, pairs of lamps for symmetry.
3. **ACCESSORIZE THOUGHTFULLY**: Add rugs, curtains, throw pillows, books, art, decorative objects that complement the anchor products.
4. **CREATE VISUAL BALANCE**: Distribute visual weight across the room. Don't leave empty corners.
5. **WALL & COLOR INTEGRATION**: If walls are bare, consider adding accent colors, artwork, or shelving that harmonizes with the products' colors.
6. **LIGHTING DESIGN**: Add floor lamps, table lamps, or pendant lights to create ambiance.
7. **TEXTURE & LAYERS**: Mix textures (wood, fabric, metal, glass) to create depth.

════════════════════════════════════════════════════════════════════
🏗️ TECHNICAL EXECUTION
════════════════════════════════════════════════════════════════════

STEP 1: Analyze Image 1's perspective grid, vanishing points, and light direction.
STEP 2: Clean the space - remove existing clutter if any.
STEP 3: Place each anchor product in a strategic location with correct perspective.
STEP 4: Design the REST of the room around these anchors - add all complementary elements.
STEP 5: Apply proper lighting, shadows, and reflections based on Image 1's light sources.
STEP 6: Final polish - ensure everything looks photorealistic and cohesive.

════════════════════════════════════════════════════════════════════
🎨 STYLE DIRECTION
════════════════════════════════════════════════════════════════════

- **Design Style:** ${analysis.style || 'Modern'}
- **Color Palette:** ${analysis.colorPalette?.join(', ') || 'Neutral with warm accents'}
- **Room Type:** ${analysis.roomType || 'Living space'}
- **Empty Areas to Fill:** ${analysis.emptyAreas?.join(', ') || 'Entire room'}

════════════════════════════════════════════════════════════════════
📤 OUTPUT REQUIREMENTS
════════════════════════════════════════════════════════════════════

Generate a SINGLE photorealistic image showing:
- The EXACT same room from Image 1 (same walls, floor, windows, perspective)
- All ${products.length} anchor products prominently featured and correctly scaled
- A COMPLETE, professional interior design with complementary furniture and accessories
- Magazine-quality staging that would impress a real estate professional

DO NOT output text. Output ONLY the final decorated room image.`;
}

/**
 * Simple staging prompt for when no reference products are available.
 */
export function buildSimpleStagingPrompt(analysis: RoomAnalysisResult, customPrompt?: string): string {
    return `🎨 ROLE: You are a CREATIVE PROFESSIONAL INTERIOR DESIGNER.

Transform this empty room into a beautifully decorated, magazine-worthy living space.

**IMAGE 1 = THE EMPTY ROOM**
- PRESERVE: walls, windows, doors, floor material, architectural features.
- TRANSFORM: Design a complete interior that matches the room's style and purpose.

**YOUR MISSION:**
1. ${customPrompt || 'Design a complete, harmonious interior appropriate for this room type.'}
2. Add furniture, accessories, art, plants, lighting - everything needed for a lived-in look.
3. Create visual balance and professional staging quality.
4. Match the ${analysis.style || 'modern'} style aesthetic.

**OUTPUT:** Generate ONLY a photorealistic image of the fully decorated room.`;
}

/**
 * Staging prompt configuration.
 */
export const STAGING_GENERATION_CONFIG = {
    version: '2.0.0',

    generationConfig: {
        responseModalities: ['IMAGE'],
        temperature: 0.6, // Increased for more creativity
        maxOutputTokens: 8192,
    },

    safetySettings: [
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
    ],

    /**
     * Enhanced negative prompt to prevent structural changes while allowing creativity.
     */
    defaultNegativePrompt:
        'changing walls, changing windows, changing doors, changing floor type, architectural changes, distorted perspective, floating furniture, bad shadows, low quality, cartoon, sketch, watermark, text, copying background from reference images, empty room, unfurnished, bare walls with nothing on them',
} as const;
