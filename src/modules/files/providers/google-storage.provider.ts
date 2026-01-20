import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storage, Bucket } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';
import type { StorageProvider, UploadOptions, UploadResult } from '../interfaces/storage-provider.interface';

const ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',

    'model/gltf-binary',
    'model/gltf+json',
    'model/vnd.usdz+zip'
];

@Injectable()
export class GoogleCloudStorageProvider implements StorageProvider {
    private readonly logger = new Logger(GoogleCloudStorageProvider.name);
    private readonly storage: Storage;
    private readonly bucket: Bucket;
    private readonly bucketName: string;

    constructor(private readonly configService: ConfigService) {
        this.bucketName = this.configService.get<string>('GOOGLE_STORAGE_BUCKET')!;

        if (!this.bucketName) {
            throw new Error('GOOGLE_STORAGE_BUCKET is not configured');
        }

        this.storage = new Storage();
        this.bucket = this.storage.bucket(this.bucketName);
    }

    async upload(file: Express.Multer.File, options?: UploadOptions): Promise<UploadResult> {
        const extension = file.originalname.split('.').pop() || '';
        const filename = options?.filename || `${uuidv4()}.${extension}`;

        const filePath = options?.folder ? `${options.folder}/${filename}` : filename;

        const fileRef = this.bucket.file(filePath);

        await fileRef.save(file.buffer, {
            contentType: file.mimetype,
            resumable: false,
            metadata: {
                originalName: file.originalname,
            }
        });

        this.logger.log(`File uploaded to GCS: ${filePath}`);

        const publicUrl = `https://storage.googleapis.com/${this.bucketName}/${filePath}`;

        return {
            url: publicUrl,
            key: filePath,
            size: file.size,
            contentType: file.mimetype,
        };
    }

    async delete(fileKey: string): Promise<void> {
        try {
            const fileRef = this.bucket.file(fileKey);
            // 'ignoreNotFound' es el equivalente a deleteIfExists de Azure
            await fileRef.delete({ ignoreNotFound: true });
            this.logger.log(`File deleted from GCS: ${fileKey}`);
        } catch (error) {
            this.logger.error(`Error deleting file ${fileKey}: ${error.message}`);
            throw error;
        }
    }

    async getSignedUrl(fileKey: string): Promise<string> {
        const [url] = await this.bucket.file(fileKey).getSignedUrl({
            version: 'v4',
            action: 'read',
            expires: Date.now() + 15 * 60 * 1000,
        });
        return url;
    }

    getGsUri(fileKey: string): string {
        return `gs://${this.bucketName}/${fileKey}`;
    }

    // --- Signed URL new method ---
    async getUploadSignedUrl(filename: string, contentType: string, folder?: string): Promise<{ url: string; key: string }> {

        if (!ALLOWED_MIME_TYPES.includes(contentType)) {
            this.logger.warn(`Upload blocked: ${contentType}`);
            throw new BadRequestException(`File type not allowed.`);
        }

        const extension = filename.split('.').pop() || '';
        const uniqueFilename = `${uuidv4()}.${extension}`;
        const filePath = folder ? `${folder}/${uniqueFilename}` : uniqueFilename;

        const fileRef = this.bucket.file(filePath);

        const [url] = await fileRef.getSignedUrl({
            version: 'v4',
            action: 'write',
            expires: Date.now() + 15 * 60 * 1000,
            contentType: contentType,
        });

        this.logger.log(`Generated upload Signed URL for: ${filePath}`);

        return {
            url,
            key: filePath
        };
    }
}
