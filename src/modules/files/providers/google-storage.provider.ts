import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bucket, Storage } from '@google-cloud/storage';
import type {
  SignedUploadPolicy,
  StoredObjectMetadata,
  StorageProvider,
} from '../interfaces/storage-provider.interface';

const UPLOAD_URL_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class GoogleCloudStorageProvider implements StorageProvider {
  private readonly logger = new Logger(GoogleCloudStorageProvider.name);
  private readonly bucket: Bucket;
  private readonly bucketName: string;

  constructor(configService: ConfigService) {
    this.bucketName = configService.getOrThrow<string>('GOOGLE_STORAGE_BUCKET');
    this.bucket = new Storage().bucket(this.bucketName);
  }

  async createUploadPolicy(
    key: string,
    contentType: string,
    maxBytes: number,
  ): Promise<SignedUploadPolicy> {
    const [policy] = await this.bucket.file(key).generateSignedPostPolicyV4({
      expires: Date.now() + UPLOAD_URL_TTL_MS,
      fields: {
        'Content-Type': contentType,
        'Content-Disposition': 'attachment',
      },
      conditions: [['content-length-range', 1, maxBytes]],
    });
    return { url: policy.url, fields: policy.fields, key };
  }

  async getMetadata(key: string): Promise<StoredObjectMetadata | null> {
    try {
      const [metadata] = await this.bucket.file(key).getMetadata();
      return {
        size: Number(metadata.size),
        contentType: metadata.contentType ?? '',
        generation: String(metadata.generation ?? ''),
      };
    } catch (error) {
      if ((error as { code?: number }).code === 404) return null;
      throw error;
    }
  }

  async getHeader(key: string, generation: string): Promise<Buffer | null> {
    try {
      const [header] = await this.bucket.file(key, { generation }).download({
        start: 0,
        end: 31,
      });
      return header;
    } catch (error) {
      if ((error as { code?: number }).code === 404) return null;
      throw error;
    }
  }

  async promote(
    sourceKey: string,
    destinationKey: string,
    generation: string,
  ): Promise<void> {
    const source = this.bucket.file(sourceKey, { generation });
    await source.copy(this.bucket.file(destinationKey), {
      contentDisposition: 'inline',
      preconditionOpts: { ifGenerationMatch: 0 },
    });
    try {
      await source.delete({ ignoreNotFound: true });
    } catch (error) {
      this.logger.warn(
        `Temporary object cleanup failed for ${sourceKey}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async delete(key: string): Promise<void> {
    await this.bucket.file(key).delete({ ignoreNotFound: true });
  }

  getPublicUrl(key: string): string {
    return `https://storage.googleapis.com/${this.bucketName}/${key}`;
  }
}
