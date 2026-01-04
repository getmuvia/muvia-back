import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import { v4 as uuidv4 } from 'uuid';
import type { StorageProvider, UploadOptions, UploadResult } from '../interfaces/storage-provider.interface';

@Injectable()
export class AzureBlobStorageProvider implements StorageProvider {
    private readonly logger = new Logger(AzureBlobStorageProvider.name);
    private readonly containerClient: ContainerClient;

    constructor(private readonly configService: ConfigService) {
        const connectionString = this.configService.get<string>('AZURE_STORAGE_CONNECTION_STRING');

        if (!connectionString) {
            throw new Error('AZURE_STORAGE_CONNECTION_STRING is not configured');
        }

        const containerName = this.configService.get<string>('AZURE_CONTAINER_NAME', 'uploads');

        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        this.containerClient = blobServiceClient.getContainerClient(containerName);
    }

    async upload(file: Express.Multer.File, options?: UploadOptions): Promise<UploadResult> {
        const extension = file.originalname.split('.').pop() || '';
        const filename = options?.filename || `${uuidv4()}.${extension}`;
        const blobPath = options?.folder ? `${options.folder}/${filename}` : filename;

        const blockBlobClient = this.containerClient.getBlockBlobClient(blobPath);

        await blockBlobClient.uploadData(file.buffer, {
            blobHTTPHeaders: { blobContentType: file.mimetype },
        });

        this.logger.log(`File uploaded: ${blobPath}`);

        return {
            url: blockBlobClient.url,
            key: blobPath,
            size: file.size,
            contentType: file.mimetype,
        };
    }

    async delete(fileKey: string): Promise<void> {
        const blockBlobClient = this.containerClient.getBlockBlobClient(fileKey);
        await blockBlobClient.deleteIfExists();
        this.logger.log(`File deleted: ${fileKey}`);
    }

    async getSignedUrl(fileKey: string): Promise<string> {
        return this.containerClient.getBlockBlobClient(fileKey).url;
    }
}
