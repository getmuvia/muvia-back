import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import {
  createErrorPayload,
  ERROR_CODES,
} from '../../common/errors/error-code';
import { ProductAsset } from '../products/entities/product-asset.entity';
import { VendorProfile } from '../users/entities/vendor-profile.entity';
import { CreateUploadPolicyDto } from './dto/create-upload-policy.dto';
import {
  FileUploadPurpose,
  matchesFileSignature,
  resolveFileUploadPolicy,
  resolveStoredFilePolicy,
  type FileUploadPolicy,
} from './file-upload-policy';
import {
  STORAGE_PROVIDER,
  type SignedUploadPolicy,
  type StoredObjectMetadata,
  type StorageProvider,
} from './interfaces/storage-provider.interface';

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    @Inject(STORAGE_PROVIDER)
    private readonly storageProvider: StorageProvider,
    @InjectRepository(ProductAsset)
    private readonly productAssets: Repository<ProductAsset>,
    @InjectRepository(VendorProfile)
    private readonly vendorProfiles: Repository<VendorProfile>,
  ) {}

  createUploadPolicy(
    userId: string,
    dto: CreateUploadPolicyDto,
  ): Promise<SignedUploadPolicy> {
    const policy = resolveFileUploadPolicy(
      dto.purpose,
      dto.contentType,
      dto.fileSize,
    );
    const key = `pending/${dto.purpose}/${userId}/${randomUUID()}.${policy.extension}`;
    return this.storageProvider.createUploadPolicy(
      key,
      policy.contentType,
      policy.maxBytes,
    );
  }

  async finalizeUpload(
    userId: string,
    pendingKey: string,
  ): Promise<{ key: string; url: string }> {
    const parts = pendingKey.split('/');
    if (
      parts.length !== 4 ||
      parts[0] !== 'pending' ||
      parts[2] !== userId ||
      !this.isGeneratedFilename(parts[3])
    ) {
      throw new ForbiddenException(
        createErrorPayload(
          ERROR_CODES.FILE_FORBIDDEN,
          'You do not have permission to finalize this file',
        ),
      );
    }
    const purpose = parts[1] as FileUploadPurpose;
    const extension = parts[3].split('.').pop()!;
    const policy = resolveStoredFilePolicy(purpose, extension);
    const finalKey = `${policy.folder}/${userId}/${parts[3]}`;
    const metadata = await this.storageProvider.getMetadata(pendingKey);
    if (!metadata) {
      await this.requireVerifiedObject(finalKey, policy);
      return {
        key: finalKey,
        url: this.storageProvider.getPublicUrl(finalKey),
      };
    }
    this.assertValidMetadata(metadata, policy);
    await this.assertValidSignature(pendingKey, metadata, policy);

    try {
      await this.storageProvider.promote(
        pendingKey,
        finalKey,
        metadata.generation,
      );
    } catch (error) {
      if ((error as { code?: number }).code !== 412) throw error;
      await this.requireVerifiedObject(finalKey, policy);
    }
    return { key: finalKey, url: this.storageProvider.getPublicUrl(finalKey) };
  }

  async verifyAssetReference(
    userId: string,
    url: string,
    purpose: FileUploadPurpose,
  ): Promise<void> {
    const policyFolder =
      purpose === FileUploadPurpose.PROFILE_IMAGE ? 'users' : 'products';
    const prefix = `${policyFolder}/${userId}/`;
    const publicPrefix = this.storageProvider.getPublicUrl(prefix);
    if (!url.startsWith(publicPrefix)) {
      throw new BadRequestException(
        createErrorPayload(
          ERROR_CODES.FILE_FORBIDDEN,
          'File does not belong to the authenticated user',
        ),
      );
    }
    const key = url.slice(this.storageProvider.getPublicUrl('').length);
    const parts = key.split('/');
    if (parts.length !== 3 || !this.isGeneratedFilename(parts[2])) {
      throw new BadRequestException(
        createErrorPayload(ERROR_CODES.FILE_INVALID, 'Invalid file URL'),
      );
    }
    const extension = parts[2].split('.').pop()!;
    const policy = resolveStoredFilePolicy(purpose, extension);
    await this.requireVerifiedObject(key, policy);
  }

  async deleteFile(userId: string, key: string): Promise<void> {
    this.assertOwnedAssetKey(userId, key);
    const publicUrl = this.storageProvider.getPublicUrl(key);
    const [isProductAsset, isProfileAsset] = await Promise.all([
      this.productAssets.existsBy({ url: publicUrl }),
      this.vendorProfiles.exists({
        where: [{ logoUrl: publicUrl }, { coverImage: publicUrl }],
      }),
    ]);

    if (isProductAsset || isProfileAsset) {
      throw new ConflictException(
        createErrorPayload(
          ERROR_CODES.FILE_IN_USE,
          'File is already in use and cannot be deleted directly',
        ),
      );
    }

    await this.storageProvider.delete(key);
    this.logger.log(`Draft file deleted: ${key}`);
  }

  private assertOwnedAssetKey(userId: string, key: string): void {
    const parts = key.split('/');
    const validFolder = parts[0] === 'products' || parts[0] === 'users';
    const validFilename =
      parts.length === 3 && this.isGeneratedFilename(parts[2]);

    if (!validFolder || parts[1] !== userId || !validFilename) {
      throw new ForbiddenException(
        createErrorPayload(
          ERROR_CODES.FILE_FORBIDDEN,
          'You do not have permission to delete this file',
        ),
      );
    }
  }

  private isGeneratedFilename(filename: string): boolean {
    return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\.[a-z0-9]+$/i.test(
      filename,
    );
  }

  private assertValidMetadata(
    metadata: StoredObjectMetadata | null,
    policy: FileUploadPolicy,
  ): asserts metadata is StoredObjectMetadata {
    if (
      !metadata ||
      !Number.isSafeInteger(metadata.size) ||
      metadata.size < 1 ||
      metadata.size > policy.maxBytes ||
      metadata.contentType !== policy.contentType ||
      !metadata.generation
    ) {
      throw new BadRequestException(
        createErrorPayload(
          ERROR_CODES.FILE_INVALID,
          'Uploaded file does not meet the requirements',
        ),
      );
    }
  }

  private async assertValidSignature(
    key: string,
    metadata: StoredObjectMetadata,
    policy: FileUploadPolicy,
  ): Promise<void> {
    const header = await this.storageProvider.getHeader(
      key,
      metadata.generation,
    );
    if (!matchesFileSignature(policy.contentType, header)) {
      throw new BadRequestException(
        createErrorPayload(
          ERROR_CODES.FILE_INVALID,
          'File content does not match its declared type',
        ),
      );
    }
  }

  private async requireVerifiedObject(
    key: string,
    policy: FileUploadPolicy,
  ): Promise<StoredObjectMetadata> {
    const metadata = await this.storageProvider.getMetadata(key);
    this.assertValidMetadata(metadata, policy);
    await this.assertValidSignature(key, metadata, policy);
    return metadata;
  }
}
