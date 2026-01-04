import 'multer';

/**
 * Options for file upload operations
 */
export interface UploadOptions {
    /** Target folder/container path */
    folder?: string;
    /** Custom filename (if not provided, a unique name will be generated) */
    filename?: string;
    /** MIME type of the file */
    contentType?: string;
    /** Additional metadata to store with the file */
    metadata?: Record<string, string>;
}

/**
 * Result of a successful file upload
 */
export interface UploadResult {
    /** Public URL to access the file */
    url: string;
    /** Unique key/identifier for the file (used for delete/update operations) */
    key: string;
    /** File size in bytes */
    size: number;
    /** MIME type of the uploaded file */
    contentType: string;
    /** Metadata associated with the file */
    metadata?: Record<string, string>;
}

/**
 * Abstract interface for storage providers.
 * Implement this interface to add support for new cloud storage services.
 */
export interface StorageProvider {
    /**
     * Upload a file to the storage service
     * @param file - File buffer or Multer file object
     * @param options - Upload options (folder, filename, contentType, metadata)
     * @returns Promise with upload result containing URL and key
     */
    upload(
        file: Buffer | Express.Multer.File,
        options?: UploadOptions,
    ): Promise<UploadResult>;

    /**
     * Delete a file from the storage service
     * @param fileKey - Unique identifier of the file to delete
     */
    delete(fileKey: string): Promise<void>;

    /**
     * Get a signed/temporary URL for accessing a file
     * @param fileKey - Unique identifier of the file
     * @param expiresInSeconds - URL expiration time in seconds (default: 3600)
     * @returns Promise with signed URL
     */
    getSignedUrl(fileKey: string, expiresInSeconds?: number): Promise<string>;
}

/**
 * Injection token for StorageProvider
 * Use this token to inject the storage provider in your services
 *
 * @example
 * constructor(@Inject(STORAGE_PROVIDER) private storage: StorageProvider) {}
 */
export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
