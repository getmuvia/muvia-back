import type { ImageGenerationRequest } from '../../interfaces/image-generator.interface';

/**
 * Generic Image Generation Prompt Template
 * Used by image generators for basic room furnishing without specific products.
 *
 * @version 1.0.0
 * @provider GeminiImageGenerator, DALL-E (compatible)
 */

/**
 * Builds a simple image generation prompt.
 * Used when generating images without detailed product references.
 */
export function buildImageGenerationPrompt(request: ImageGenerationRequest): string {
    const hasProducts = request.referenceImages && request.referenceImages.length > 0;

    return `You are an expert interior designer. 
        
INPUTS:
- Image 1: The EMPTY ROOM to be furnished.
${hasProducts ? '- Subsequent Images: REAL FURNITURE products to be placed in the room.' : ''}

TASK:
Generate a photorealistic image of the room fully furnished.

STRICT RULES:
1. PRESERVE the room's structural integrity (walls, windows, floor, lighting) from Image 1.
${hasProducts ? '2. Use the visual details from the furniture reference images to place them in the room.' : ''}
3. ${request.prompt}
4. Style: ${request.style || 'Modern'}.
5. Output ONLY the final generated image.`;
}

/**
 * Configuration for generic image generation.
 */
export const IMAGE_GENERATION_CONFIG = {
    version: '1.0.0',

    generationConfig: {
        responseModalities: ['IMAGE'],
        temperature: 0.4,
        maxOutputTokens: 8192,
    },

    safetySettings: [
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
    ],
} as const;
