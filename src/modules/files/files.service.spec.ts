import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { ProductAsset } from '../products/entities/product-asset.entity';
import { VendorProfile } from '../users/entities/vendor-profile.entity';
import { FileUploadPurpose } from './file-upload-policy';
import { FilesService } from './files.service';
import type { StorageProvider } from './interfaces/storage-provider.interface';

describe('FilesService', () => {
  const ownerId = 'dc8dd62a-dfff-4d11-859c-c18ba81f1014';
  const otherId = '4086d274-6f0e-418e-818e-5397ee425746';
  const key = `products/${ownerId}/089d9a4e-68c2-4ac7-a1c1-d4c907471537.jpg`;
  const publicUrl = `https://storage.googleapis.com/assets/${key}`;

  const storage = {
    createUploadPolicy: jest.fn(),
    getMetadata: jest.fn(),
    getHeader: jest.fn(),
    promote: jest.fn(),
    getPublicUrl: jest.fn(),
    delete: jest.fn(),
  };
  const productAssets = { existsBy: jest.fn() };
  const vendorProfiles = { exists: jest.fn() };
  let service: FilesService;

  beforeEach(() => {
    jest.clearAllMocks();
    storage.createUploadPolicy.mockImplementation((requestedKey: string) =>
      Promise.resolve({
        url: 'https://upload.example',
        fields: {},
        key: requestedKey,
      }),
    );
    storage.getMetadata.mockResolvedValue({
      size: 1024,
      contentType: 'image/jpeg',
      generation: '7',
    });
    storage.getHeader.mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
    storage.promote.mockResolvedValue(undefined);
    storage.getPublicUrl.mockImplementation(
      (requestedKey: string) =>
        `https://storage.googleapis.com/assets/${requestedKey}`,
    );
    storage.delete.mockResolvedValue(undefined);
    productAssets.existsBy.mockResolvedValue(false);
    vendorProfiles.exists.mockResolvedValue(false);
    service = new FilesService(
      storage as unknown as StorageProvider,
      productAssets as unknown as Repository<ProductAsset>,
      vendorProfiles as unknown as Repository<VendorProfile>,
    );
  });

  it('creates a key under the authenticated seller with an extension from the MIME type', async () => {
    const result = await service.createUploadPolicy(ownerId, {
      purpose: FileUploadPurpose.PRODUCT_IMAGE,
      contentType: 'image/jpeg',
      fileSize: 1024,
    });

    expect(result.key).toMatch(
      new RegExp(`^pending/product_image/${ownerId}/[0-9a-f-]{36}\\.jpg$`),
    );
    expect(storage.createUploadPolicy).toHaveBeenCalledWith(
      result.key,
      'image/jpeg',
      5 * 1024 * 1024,
    );
  });

  it('finalizes a valid temporary object under the seller public prefix', async () => {
    const pendingKey = `pending/product_image/${ownerId}/089d9a4e-68c2-4ac7-a1c1-d4c907471537.jpg`;
    await expect(service.finalizeUpload(ownerId, pendingKey)).resolves.toEqual({
      key,
      url: publicUrl,
    });
    expect(storage.promote).toHaveBeenCalledWith(pendingKey, key, '7');
  });

  it('returns an already finalized object when the response is retried', async () => {
    const pendingKey = `pending/product_image/${ownerId}/089d9a4e-68c2-4ac7-a1c1-d4c907471537.jpg`;
    storage.getMetadata.mockResolvedValueOnce(null).mockResolvedValueOnce({
      size: 1024,
      contentType: 'image/jpeg',
      generation: '8',
    });

    await expect(service.finalizeUpload(ownerId, pendingKey)).resolves.toEqual({
      key,
      url: publicUrl,
    });
    expect(storage.promote).not.toHaveBeenCalled();
  });

  it('rejects a temporary object with wrong ownership or actual size', async () => {
    const pendingKey = `pending/product_image/${ownerId}/089d9a4e-68c2-4ac7-a1c1-d4c907471537.jpg`;
    await expect(service.finalizeUpload(otherId, pendingKey)).rejects.toThrow(
      ForbiddenException,
    );
    storage.getMetadata.mockResolvedValue({
      size: 5 * 1024 * 1024 + 1,
      contentType: 'image/jpeg',
      generation: '7',
    });
    await expect(service.finalizeUpload(ownerId, pendingKey)).rejects.toThrow(
      BadRequestException,
    );
    expect(storage.promote).not.toHaveBeenCalled();
  });

  it('rejects bytes that do not match the declared file type', async () => {
    const pendingKey = `pending/product_image/${ownerId}/089d9a4e-68c2-4ac7-a1c1-d4c907471537.jpg`;
    storage.getHeader.mockResolvedValue(Buffer.from('<html>'));

    const error = await service
      .finalizeUpload(ownerId, pendingKey)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'FILE_INVALID',
      message: 'File content does not match its declared type',
    });
    expect(storage.promote).not.toHaveBeenCalled();
  });

  it('rejects a foreign or mismatched final asset reference', async () => {
    await expect(
      service.verifyAssetReference(
        otherId,
        publicUrl,
        FileUploadPurpose.PRODUCT_IMAGE,
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.verifyAssetReference(
        ownerId,
        publicUrl,
        FileUploadPurpose.PRODUCT_MODEL,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a file type or declared size outside its purpose policy', () => {
    expect(() =>
      service.createUploadPolicy(ownerId, {
        purpose: FileUploadPurpose.PROFILE_IMAGE,
        contentType: 'model/gltf-binary',
        fileSize: 1024,
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      service.createUploadPolicy(ownerId, {
        purpose: FileUploadPurpose.PRODUCT_IMAGE,
        contentType: 'image/png',
        fileSize: 5 * 1024 * 1024 + 1,
      }),
    ).toThrow(BadRequestException);
    expect(storage.createUploadPolicy).not.toHaveBeenCalled();
  });

  it('refuses to delete a key outside the authenticated seller prefix', async () => {
    await expect(service.deleteFile(otherId, key)).rejects.toThrow(
      ForbiddenException,
    );
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('refuses to delete a file already attached to a product', async () => {
    productAssets.existsBy.mockResolvedValue(true);

    await expect(service.deleteFile(ownerId, key)).rejects.toThrow(
      ConflictException,
    );
    expect(productAssets.existsBy).toHaveBeenCalledWith({ url: publicUrl });
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('refuses to delete a file used as a vendor profile image', async () => {
    vendorProfiles.exists.mockResolvedValue(true);

    await expect(service.deleteFile(ownerId, key)).rejects.toThrow(
      ConflictException,
    );
    expect(vendorProfiles.exists).toHaveBeenCalledWith({
      where: [{ logoUrl: publicUrl }, { coverImage: publicUrl }],
    });
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('deletes an unattached draft owned by the seller', async () => {
    await service.deleteFile(ownerId, key);

    expect(storage.delete).toHaveBeenCalledWith(key);
  });
});
