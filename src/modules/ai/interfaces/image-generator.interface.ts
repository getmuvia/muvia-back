import type { ImageSourceInput } from './vision-provider.interface';

/**
 * Request parameters for AI image generation.
 *
 * Supports both room staging with reference products and
 * simple image generation from prompts.
 */
export interface ImageGenerationRequest {
    /** Source image (room to be staged) */
    imageSource: ImageSourceInput;

    /** Text prompt describing the desired output */
    prompt: string;

    /** Elements to avoid in the generated image */
    negativePrompt?: string;

    /** URLs of product images to use as visual references */
    referenceImages?: string[];

    /** Output style preset */
    style?: 'photorealistic' | 'artistic' | 'sketch';

    /** 
     * Output aspect ratio. 
     * Supported: '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9', '5:4', '4:5'
     * If not provided, will try to match the source image aspect ratio.
     */
    aspectRatio?: string;
}

/**
 * Result from AI image generation.
 *
 * Contains the generated image URL and optional metadata
 * for monitoring and debugging.
 */
export interface ImageGenerationResult {
    /** Public URL of the generated image (GCS-hosted) */
    imageUrl: string;

    /** Raw image buffer (optional, for further processing) */
    imageBuffer?: Buffer;

    /** Generation metadata for monitoring */
    metadata?: {
        /** Model used for generation */
        model: string;
        /** Time taken to generate in milliseconds */
        generationTimeMs: number;
    };
}

/**
 * Port interface for AI image generation providers.
 *
 * Implements the Ports & Adapters (Hexagonal) pattern to allow
 * swapping image generation providers without changing business logic.
 *
 * Current implementations:
 * - ImagenProvider (Google Gemini multimodal)
 *
 * Future implementations could include:
 * - DALL-E (OpenAI)
 * - Stable Diffusion (Stability AI)
 * - Midjourney API
 *
 * @example
 * ```typescript
 * @Inject(IMAGE_GENERATOR)
 * private readonly imageGenerator: IImageGenerator
 * ```
 */
export interface IImageGenerator {
    /**
     * Generates a staged room image based on the source image and prompt.
     *
     * @param request - Generation parameters including source image, prompt, and references
     * @returns Generated image URL and metadata
     * @throws Error if generation fails or model doesn't support image output
     */
    generate(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
}

/**
 * Injection token for ImageGenerator.
 *
 * Use this token to inject the image generator in services.
 *
 * @example
 * ```typescript
 * constructor(
 *   @Inject(IMAGE_GENERATOR) private generator: IImageGenerator
 * ) {}
 * ```
 */
export const IMAGE_GENERATOR = Symbol('IMAGE_GENERATOR');
