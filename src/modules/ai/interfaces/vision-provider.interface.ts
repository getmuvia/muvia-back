/**
 * Image source input for AI providers.
 *
 * Supports two modes of operation:
 * - GCS Key: Uses native gs:// reference (most efficient, zero memory overhead)
 * - External URL: Downloads and converts to base64
 *
 * At least one must be provided. If both are present, key takes priority.
 *
 * @example
 * // Using GCS storage key (recommended)
 * { key: "virtual-staging/temp/abc123.jpg" }
 *
 * // Using external URL
 * { url: "https://example.com/room.jpg" }
 */
export interface ImageSourceInput {
    /**
     * Google Cloud Storage key (path within bucket).
     * Takes priority over URL if both are provided.
     *
     * @example "virtual-staging/temp/abc123.jpg"
     */
    key?: string;

    /**
     * External HTTP/HTTPS URL.
     * Used if key is not provided.
     *
     * @example "https://example.com/room.jpg"
     */
    url?: string;
}

/**
 * Result of room analysis from vision AI.
 *
 * Contains all extracted information needed for virtual staging,
 * including room type, detected style, empty areas, and color analysis.
 */
export interface RoomAnalysisResult {
    /**
     * Type of room detected.
     * @example "living room", "bedroom", "office", "dining room"
     */
    roomType: string;

    /**
     * Interior design style detected or suggested.
     * @example "modern", "minimalist", "rustic", "scandinavian"
     */
    style: string;

    /**
     * Areas identified as empty/available for furniture placement.
     * @example ["center", "left corner", "near window", "against wall"]
     */
    emptyAreas: string[];

    /**
     * Furniture pieces suggested based on room analysis.
     * Includes specific descriptions for better product matching.
     * @example ["3-seater sofa", "round coffee table", "floor lamp"]
     */
    suggestedFurniture: string[];

    /**
     * Dominant colors detected in the room.
     * Used for product color matching.
     * @example ["beige", "warm gray", "oak wood"]
     */
    colorPalette: string[];

    /**
     * Optional estimated room dimensions.
     */
    dimensions?: {
        /** Estimated width category */
        width: 'small' | 'medium' | 'large';
        /** Estimated depth category */
        depth: 'compact' | 'spacious';
    };
}

/**
 * Port interface for vision/image analysis providers.
 *
 * Implements the Ports & Adapters (Hexagonal) pattern to allow
 * swapping AI vision providers without changing business logic.
 *
 * Current implementations:
 * - GeminiVisionProvider (Google Vertex AI)
 *
 * Future implementations could include:
 * - OpenAI Vision
 * - Claude Vision
 * - AWS Rekognition
 *
 * @example
 * ```typescript
 * @Inject(VISION_PROVIDER)
 * private readonly visionProvider: IVisionProvider
 * ```
 */
export interface IVisionProvider {
    /**
     * Analyzes a room image and extracts staging-relevant information.
     *
     * @param input - Image source (GCS key or external URL)
     * @returns Structured analysis including room type, style, and furniture suggestions
     * @throws BadRequestException if no valid image source is provided
     */
    analyzeRoom(input: ImageSourceInput): Promise<RoomAnalysisResult>;
}

/**
 * Injection token for VisionProvider.
 * Use this token to inject the vision provider in services.
 *
 * @example
 * constructor(@Inject(VISION_PROVIDER) private vision: IVisionProvider) {}
 */
export const VISION_PROVIDER = Symbol('VISION_PROVIDER');
