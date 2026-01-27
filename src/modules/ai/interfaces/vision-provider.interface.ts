/**
 * Input source for image processing.
 * - key: Internal storage path (e.g., "virtual-staging/temp/123.jpg") → Provider uses native reference (gs://)
 * - url: External URL → Provider downloads the image
 * 
 * At least one must be provided. If both are present, key takes priority.
 */
export interface ImageSourceInput {
    /** Internal storage key (Google Cloud Storage path). Takes priority if present. */
    key?: string;

    /** External image URL. Used if key is not provided. */
    url?: string;
}

/**
 * Result of room analysis from vision AI.
 * Contains all extracted information needed for staging.
 */
export interface RoomAnalysisResult {
    /** Type of room detected (living room, bedroom, office, etc.) */
    roomType: string;

    /** Design style detected or suggested (modern, rustic, minimalist, etc.) */
    style: string;

    /** Areas identified as empty/available for furniture placement */
    emptyAreas: string[];

    /** Furniture pieces suggested based on room analysis */
    suggestedFurniture: string[];

    /** Dominant colors detected in the room */
    colorPalette: string[];

    /** Optional: Estimated room size */
    dimensions?: {
        width: 'small' | 'medium' | 'large';
        depth: 'compact' | 'spacious';
    };
}

/**
 * Port interface for vision/image analysis providers.
 * Implement this to add support for different AI vision services.
 *
 * @example Google Gemini, OpenAI Vision, Claude Vision
 */
export interface IVisionProvider {
    /**
     * Analyzes a room image and extracts staging-relevant information.
     * @param input - Image source (key for internal storage, url for external)
     * @returns Structured analysis of the room
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
