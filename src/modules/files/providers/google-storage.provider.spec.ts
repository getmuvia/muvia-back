import {
  Bucket,
  File,
  type GenerateSignedPostPolicyV4Options,
} from '@google-cloud/storage';
import { ConfigService } from '@nestjs/config';
import { GoogleCloudStorageProvider } from './google-storage.provider';
import type { StorageProvider } from '../interfaces/storage-provider.interface';

describe('GoogleCloudStorageProvider', () => {
  it('signs a POST policy constrained by MIME type and actual object size', async () => {
    const provider = new GoogleCloudStorageProvider({
      getOrThrow: () => 'assets',
    } as unknown as ConfigService);
    const bucket = (provider as unknown as { bucket: Bucket }).bucket;
    const file = {
      generateSignedPostPolicyV4: jest.fn().mockResolvedValue([
        {
          url: 'https://storage.googleapis.com/assets/',
          fields: { key: 'pending/product_image/owner/file.jpg' },
        },
      ]),
    };
    jest.spyOn(bucket, 'file').mockReturnValue(file as unknown as File);

    await expect(
      provider.createUploadPolicy(
        'pending/product_image/owner/file.jpg',
        'image/jpeg',
        5 * 1024 * 1024,
      ),
    ).resolves.toMatchObject({
      fields: { key: 'pending/product_image/owner/file.jpg' },
    });
    const options = (
      file.generateSignedPostPolicyV4.mock.calls as unknown as Array<
        [GenerateSignedPostPolicyV4Options]
      >
    )[0][0];
    expect(Number(options.expires)).toBeGreaterThan(Date.now());
    expect(options).toMatchObject({
      fields: {
        'Content-Type': 'image/jpeg',
        'Content-Disposition': 'attachment',
      },
      conditions: [['content-length-range', 1, 5 * 1024 * 1024]],
    });
  });

  it.each(['image/png', 'image/jpeg', 'image/webp'])(
    'preserves %s when promoting the verified source generation',
    async (contentType) => {
      const provider = new GoogleCloudStorageProvider({
        getOrThrow: () => 'assets',
      } as unknown as ConfigService);
      const bucket = (provider as unknown as { bucket: Bucket }).bucket;
      let copiedMetadata: Record<string, unknown> = {};
      const source = {
        // Cloud Storage applies the supplied metadata to the destination object.
        copy: jest.fn(
          (_destination: File, metadata: Record<string, unknown>) => {
            copiedMetadata = { ...metadata, size: '1024', generation: '43' };
            return Promise.resolve([]);
          },
        ),
        delete: jest.fn().mockResolvedValue([]),
      };
      const destination = {
        getMetadata: jest.fn(() => Promise.resolve([copiedMetadata])),
      } as unknown as File;
      const fileSpy = jest
        .spyOn(bucket, 'file')
        .mockImplementation((key: string) =>
          key === 'pending/source' ? (source as unknown as File) : destination,
        );

      // Exercise the provider through the public storage contract.
      const storage: StorageProvider = provider;
      await storage.promote(
        'pending/source',
        'products/final',
        '42',
        contentType,
      );

      await expect(storage.getMetadata('products/final')).resolves.toEqual({
        size: 1024,
        contentType,
        generation: '43',
      });

      expect(fileSpy).toHaveBeenCalledWith('pending/source', {
        generation: '42',
      });
      expect(source.copy).toHaveBeenCalledWith(destination, {
        contentType,
        contentDisposition: 'inline',
        preconditionOpts: { ifGenerationMatch: 0 },
      });
      expect(source.delete).toHaveBeenCalledWith({ ignoreNotFound: true });
    },
  );
});
