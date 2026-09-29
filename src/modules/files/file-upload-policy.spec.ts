import { BadRequestException } from '@nestjs/common';
import {
  FileUploadPurpose,
  matchesFileSignature,
  resolveFileUploadPolicy,
} from './file-upload-policy';

describe('file signatures', () => {
  it.each([
    ['image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0])],
    ['image/png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])],
    ['image/webp', Buffer.from('RIFF1234WEBP', 'ascii')],
    ['model/gltf-binary', Buffer.from([103, 108, 84, 70, 2, 0, 0, 0])],
    ['model/gltf+json', Buffer.from('  {"asset":{}}')],
    ['model/vnd.usdz+zip', Buffer.from([80, 75, 3, 4])],
  ])('recognizes %s', (contentType, header) => {
    expect(matchesFileSignature(contentType, header)).toBe(true);
    expect(matchesFileSignature(contentType, Buffer.from('<html>'))).toBe(
      false,
    );
  });
});

describe('file upload policy errors', () => {
  it('returns a stable code and English message for a rejected type', () => {
    try {
      resolveFileUploadPolicy(FileUploadPurpose.PRODUCT_IMAGE, 'text/html', 10);
      throw new Error('Expected the upload policy to reject the file');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'FILE_TYPE_NOT_ALLOWED',
        message: 'File type is not allowed for this upload purpose',
      });
    }
  });
});
