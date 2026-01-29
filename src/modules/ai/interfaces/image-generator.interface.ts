import type { ImageSourceInput } from './vision-provider.interface';

/**
 * Request parameters for image generation.
 */
export interface ImageGenerationRequest {
    imageSource: ImageSourceInput;
    prompt: string;
    negativePrompt?: string;
    referenceImages?: string[];
    style?: 'photorealistic' | 'artistic' | 'sketch';
}

/**
 * Result from image generation.
 */
export interface ImageGenerationResult {
    imageUrl: string;
    imageBuffer?: Buffer;
    metadata?: {
        model: string;
        generationTimeMs: number;
    };
}

/**
 * Port interface for image generation providers.
 * Implement this to add support for different AI image generation services.
 *
 * @example Google Imagen, OpenAI DALL-E, Stability AI
 */
export interface IImageGenerator {
    /**
     * Generates a staged room image based on the original and prompt.
     * @param request - Generation parameters including base image and prompt
     * @returns Generated image URL and optional metadata
     */
    generate(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
}

/**
 * Injection token for ImageGenerator.
 * Use this token to inject the image generator in services.
 *
 * @example
 * constructor(@Inject(IMAGE_GENERATOR) private generator: IImageGenerator) {}
 */
export const IMAGE_GENERATOR = Symbol('IMAGE_GENERATOR');
