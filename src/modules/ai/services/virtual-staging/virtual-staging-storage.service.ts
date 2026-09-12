import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storage } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';
import { InitUploadDto } from '../../../files/dto/upload-file.dto';

const UPLOAD_PREFIX = 'virtual-staging/uploads';
const RESULT_PREFIX = 'virtual-staging/results';
const UPLOAD_URL_TTL_MS = 15 * 60 * 1000;
const RESULT_URL_TTL_MS = 60 * 60 * 1000;

const IMAGE_EXTENSIONS: Readonly<Record<string, string>> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
};

export interface VirtualStagingStoredImage {
    key: string;
    url: string;
    urlExpiresAt: string;
}

/** Owns storage operations for sensitive virtual-staging media. */
@Injectable()
export class VirtualStagingStorageService {
    private readonly logger = new Logger(VirtualStagingStorageService.name);
    private readonly storage = new Storage();
    private readonly bucketName: string;

    constructor(configService: ConfigService) {
        this.bucketName = configService.get<string>('GOOGLE_AI_STORAGE_BUCKET') ?? '';

        if (!this.bucketName) {
            throw new Error('GOOGLE_AI_STORAGE_BUCKET is not configured');
        }
    }

    async createUploadUrl(
        userId: string,
        upload: InitUploadDto,
    ): Promise<{ url: string; key: string }> {
        const extension = IMAGE_EXTENSIONS[upload.contentType];

        if (!extension) {
            throw new BadRequestException('Only JPG, PNG and WebP images are allowed.');
        }

        const key = `${UPLOAD_PREFIX}/${userId}/${uuidv4()}.${extension}`;
        const [url] = await this.storage
            .bucket(this.bucketName)
            .file(key)
            .getSignedUrl({
                version: 'v4',
                action: 'write',
                expires: Date.now() + UPLOAD_URL_TTL_MS,
                contentType: upload.contentType,
            });

        return { url, key };
    }

    assertOwnedUploadKey(key: string, userId: string): void {
        if (!key.startsWith(`${UPLOAD_PREFIX}/${userId}/`)) {
            throw new BadRequestException('The uploaded room image does not belong to the current user.');
        }
    }

    async deleteUpload(key: string): Promise<void> {
        await this.storage.bucket(this.bucketName).file(key).delete({ ignoreNotFound: true });
        this.logger.debug('Temporary virtual-staging upload removed.');
    }

    async storeGeneratedImage(
        base64: string,
        userId: string,
    ): Promise<VirtualStagingStoredImage> {
        const key = `${RESULT_PREFIX}/${userId}/${uuidv4()}.png`;
        const file = this.storage.bucket(this.bucketName).file(key);

        await file.save(Buffer.from(base64, 'base64'), {
            contentType: 'image/png',
            resumable: false,
            metadata: { cacheControl: 'private, no-store' },
        });

        const expiresAt = new Date(Date.now() + RESULT_URL_TTL_MS);
        const [url] = await file.getSignedUrl({
            version: 'v4',
            action: 'read',
            expires: expiresAt,
        });

        return {
            key,
            url,
            urlExpiresAt: expiresAt.toISOString(),
        };
    }
}
