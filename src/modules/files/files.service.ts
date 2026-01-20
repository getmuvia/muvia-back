import { Injectable, Inject, Logger } from '@nestjs/common';
import type { StorageProvider, UploadResult } from './interfaces/storage-provider.interface';
import { STORAGE_PROVIDER } from './interfaces/storage-provider.interface';

@Injectable()
export class FilesService {
    private readonly logger = new Logger(FilesService.name);

    constructor(
        @Inject(STORAGE_PROVIDER)
        private readonly storageProvider: StorageProvider,
    ) { }

    /**
     * Upload a file to the configured storage provider
     * @param file - Multer file object from the request
     * @param folder - Optional folder/path to organize files
     * @returns Upload result with URL and key
     */
    async uploadFile(
        file: Express.Multer.File,
        folder?: string,
    ): Promise<UploadResult> {
        this.logger.log(
            `Uploading file: ${file.originalname} (${file.size} bytes)`,
        );

        const result = await this.storageProvider.upload(file, { folder });

        this.logger.log(`File uploaded successfully: ${result.key}`);
        return result;
    }

    /**
     * Delete a file from storage
     * @param fileKey - Unique identifier of the file
     */
    async deleteFile(fileKey: string): Promise<void> {
        this.logger.log(`Deleting file: ${fileKey}`);
        await this.storageProvider.delete(fileKey);
        this.logger.log(`File deleted successfully: ${fileKey}`);
    }

    /**
     * Get a signed URL for temporary file access
     * @param fileKey - Unique identifier of the file
     * @param expiresInSeconds - URL expiration time (default: 1 hour)
     * @returns Signed URL for file access
     */
    async getSignedUrl(
        fileKey: string,
        expiresInSeconds?: number,
    ): Promise<string> {
        return this.storageProvider.getSignedUrl(fileKey, expiresInSeconds);
    }

    async generateUploadUrl(filename: string, contentType: string, folder?: string) {
        this.logger.log(`Generating upload URL for: ${filename}`);
        return this.storageProvider.getUploadSignedUrl(filename, contentType, folder);
    }
}
