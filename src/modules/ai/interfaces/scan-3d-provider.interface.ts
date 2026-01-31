/**
 * Result from 3D scan job creation.
 *
 * Contains the job identifier and expected output location
 * for tracking the async processing.
 */
export interface Scan3DResult {
    /** Unique identifier for the scan job */
    jobId: string;

    /** Current status of the job */
    status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

    /** Expected URL where the 3D model will be available */
    outputUrl: string;
}

/**
 * Port interface for 3D scan providers.
 *
 * Implements the Ports & Adapters (Hexagonal) pattern to allow
 * swapping 3D scanning providers without changing business logic.
 *
 * Current implementations:
 * - Vertex3DProvider (Google Vertex AI Custom Jobs)
 *
 * Future implementations could include:
 * - Meshroom API
 * - Polycam API
 * - RealityCapture API
 *
 * @example
 * ```typescript
 * @Inject(SCAN_3D_PROVIDER)
 * private readonly scan3DProvider: IScan3DProvider
 * ```
 */
export interface IScan3DProvider {
    /**
     * Starts an asynchronous 3D scan job from a video file.
     *
     * @param videoFilename - Name of the video file in storage (e.g., "chair.mp4")
     * @returns Job information including ID and expected output URL
     * @throws Error if job creation fails
     */
    start3DScan(videoFilename: string): Promise<Scan3DResult>;
}

/**
 * Injection token for Scan3DProvider.
 *
 * Use this token to inject the 3D scan provider in services.
 *
 * @example
 * ```typescript
 * constructor(
 *   @Inject(SCAN_3D_PROVIDER) private scan3D: IScan3DProvider
 * ) {}
 * ```
 */
export const SCAN_3D_PROVIDER = Symbol('SCAN_3D_PROVIDER');
