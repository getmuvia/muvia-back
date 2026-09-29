import {
  Bucket,
  File,
  type GenerateSignedPostPolicyV4Options,
} from '@google-cloud/storage';
import { ConfigService } from '@nestjs/config';
import { GoogleCloudStorageProvider } from './google-storage.provider';

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

  it('copies only the verified source generation to a new final key', async () => {
    const provider = new GoogleCloudStorageProvider({
      getOrThrow: () => 'assets',
    } as unknown as ConfigService);
    const bucket = (provider as unknown as { bucket: Bucket }).bucket;
    const source = {
      copy: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue([]),
    };
    const destination = {} as File;
    const fileSpy = jest
      .spyOn(bucket, 'file')
      .mockImplementation((key: string) =>
        key === 'pending/source' ? (source as unknown as File) : destination,
      );

    await provider.promote('pending/source', 'products/final', '42');

    expect(fileSpy).toHaveBeenCalledWith('pending/source', {
      generation: '42',
    });
    expect(source.copy).toHaveBeenCalledWith(destination, {
      contentDisposition: 'inline',
      preconditionOpts: { ifGenerationMatch: 0 },
    });
    expect(source.delete).toHaveBeenCalledWith({ ignoreNotFound: true });
  });
});
