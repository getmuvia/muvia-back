import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import type { StorageProvider, UploadOptions, UploadResult } from '../interfaces/storage-provider.interface';

@Injectable()
export class LocalStorageProvider implements StorageProvider {
    private readonly logger = new Logger(LocalStorageProvider.name);
    private readonly uploadDir = 'uploads';

    constructor() {
        this.ensureUploadDirExists();
    }

    private ensureUploadDirExists() {
        if (!fs.existsSync(this.uploadDir)) {
            fs.mkdirSync(this.uploadDir, { recursive: true });
        }
    }

    async upload(file: Buffer | Express.Multer.File, options?: UploadOptions): Promise<UploadResult> {
        this.ensureUploadDirExists();

        const buffer = Buffer.isBuffer(file) ? file : file.buffer;
        const originalName = !Buffer.isBuffer(file) ? file.originalname : 'file.bin';
        const mimeType = !Buffer.isBuffer(file) ? file.mimetype : 'application/octet-stream';
        const size = !Buffer.isBuffer(file) ? file.size : buffer.length;

        const extension = originalName.split('.').pop() || '';
        const filename = options?.filename || `${uuidv4()}.${extension}`;

        const relativePath = options?.folder ? path.join(options.folder, filename) : filename;
        const fullPath = path.join(this.uploadDir, relativePath);

        const dirname = path.dirname(fullPath);
        if (!fs.existsSync(dirname)) {
            fs.mkdirSync(dirname, { recursive: true });
        }

        fs.writeFileSync(fullPath, buffer);

        this.logger.log(`File uploaded locally: ${fullPath}`);

        return {
            url: `/uploads/${relativePath.replace(/\\/g, '/')}`,
            key: relativePath.replace(/\\/g, '/'),
            size: size,
            contentType: mimeType,
        };
    }

    async delete(fileKey: string): Promise<void> {
        const fullPath = path.join(this.uploadDir, fileKey);
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            this.logger.log(`File deleted locally: ${fullPath}`);
        } else {
            this.logger.warn(`File not found for deletion: ${fullPath}`);
        }
    }

    async getSignedUrl(fileKey: string): Promise<string> {
        return `/uploads/${fileKey}`;
    }

    async getUploadSignedUrl(filename: string, contentType: string, folder?: string): Promise<{ url: string; key: string }> {
        throw new Error('Method not implemented.');
    }
}
