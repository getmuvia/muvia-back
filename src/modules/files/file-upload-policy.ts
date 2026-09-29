import { BadRequestException } from '@nestjs/common';
import {
  createErrorPayload,
  ERROR_CODES,
} from '../../common/errors/error-code';

export enum FileUploadPurpose {
  PROFILE_IMAGE = 'profile_image',
  PRODUCT_IMAGE = 'product_image',
  PRODUCT_MODEL = 'product_model',
}

const IMAGE_EXTENSIONS: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const MODEL_EXTENSIONS: Readonly<Record<string, string>> = {
  'model/gltf-binary': 'glb',
  'model/gltf+json': 'gltf',
  'model/vnd.usdz+zip': 'usdz',
};

const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const MODEL_MAX_BYTES = 50 * 1024 * 1024;

export interface FileUploadPolicy {
  folder: 'products' | 'users';
  extension: string;
  contentType: string;
  maxBytes: number;
}

const PURPOSE_POLICIES: Readonly<
  Record<
    FileUploadPurpose,
    {
      folder: FileUploadPolicy['folder'];
      extensions: Readonly<Record<string, string>>;
      maxBytes: number;
    }
  >
> = {
  [FileUploadPurpose.PROFILE_IMAGE]: {
    folder: 'users',
    extensions: IMAGE_EXTENSIONS,
    maxBytes: IMAGE_MAX_BYTES,
  },
  [FileUploadPurpose.PRODUCT_IMAGE]: {
    folder: 'products',
    extensions: IMAGE_EXTENSIONS,
    maxBytes: IMAGE_MAX_BYTES,
  },
  [FileUploadPurpose.PRODUCT_MODEL]: {
    folder: 'products',
    extensions: MODEL_EXTENSIONS,
    maxBytes: MODEL_MAX_BYTES,
  },
};

export function resolveFileUploadPolicy(
  purpose: FileUploadPurpose,
  contentType: string,
  fileSize: number,
): FileUploadPolicy {
  const policy = PURPOSE_POLICIES[purpose];
  if (!policy) {
    throw new BadRequestException(
      createErrorPayload(
        ERROR_CODES.FILE_UPLOAD_PURPOSE_INVALID,
        'Invalid file upload purpose',
      ),
    );
  }
  const extension = policy.extensions[contentType];

  if (!extension) {
    throw new BadRequestException(
      createErrorPayload(
        ERROR_CODES.FILE_TYPE_NOT_ALLOWED,
        'File type is not allowed for this upload purpose',
      ),
    );
  }
  if (
    !Number.isSafeInteger(fileSize) ||
    fileSize < 1 ||
    fileSize > policy.maxBytes
  ) {
    throw new BadRequestException(
      createErrorPayload(
        ERROR_CODES.FILE_SIZE_INVALID,
        `File size must be between 1 byte and ${policy.maxBytes / 1024 / 1024} MB`,
      ),
    );
  }

  return {
    folder: policy.folder,
    extension,
    contentType,
    maxBytes: policy.maxBytes,
  };
}

export function resolveStoredFilePolicy(
  purpose: FileUploadPurpose,
  extension: string,
): FileUploadPolicy {
  const policy = PURPOSE_POLICIES[purpose];
  if (!policy) {
    throw new BadRequestException(
      createErrorPayload(
        ERROR_CODES.FILE_UPLOAD_PURPOSE_INVALID,
        'Invalid file upload purpose',
      ),
    );
  }
  const contentType = Object.entries(policy.extensions).find(
    ([, allowedExtension]) => allowedExtension === extension,
  )?.[0];
  if (!contentType) {
    throw new BadRequestException(
      createErrorPayload(
        ERROR_CODES.FILE_TYPE_NOT_ALLOWED,
        'File type is not allowed for this upload purpose',
      ),
    );
  }
  return {
    folder: policy.folder,
    extension,
    contentType,
    maxBytes: policy.maxBytes,
  };
}

export function matchesFileSignature(
  contentType: string,
  header: Buffer | null,
): boolean {
  if (!header) return false;
  switch (contentType) {
    case 'image/jpeg':
      return (
        header.length >= 3 &&
        header[0] === 0xff &&
        header[1] === 0xd8 &&
        header[2] === 0xff
      );
    case 'image/png':
      return header
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    case 'image/webp':
      return (
        header.toString('ascii', 0, 4) === 'RIFF' &&
        header.toString('ascii', 8, 12) === 'WEBP'
      );
    case 'model/gltf-binary':
      return (
        header.toString('ascii', 0, 4) === 'glTF' &&
        header.length >= 8 &&
        header.readUInt32LE(4) === 2
      );
    case 'model/gltf+json':
      return header
        .toString('utf8')
        .replace(/^\uFEFF/, '')
        .trimStart()
        .startsWith('{');
    case 'model/vnd.usdz+zip':
      return (
        header.length >= 4 &&
        header.toString('ascii', 0, 2) === 'PK' &&
        header[2] === 3 &&
        header[3] === 4
      );
    default:
      return false;
  }
}
