export interface SignedUploadPolicy {
  url: string;
  fields: Record<string, string>;
  key: string;
}

export interface StoredObjectMetadata {
  size: number;
  contentType: string;
  generation: string;
}

export interface StorageProvider {
  createUploadPolicy(
    key: string,
    contentType: string,
    maxBytes: number,
  ): Promise<SignedUploadPolicy>;
  getMetadata(key: string): Promise<StoredObjectMetadata | null>;
  getHeader(key: string, generation: string): Promise<Buffer | null>;
  promote(
    sourceKey: string,
    destinationKey: string,
    generation: string,
  ): Promise<void>;
  delete(key: string): Promise<void>;
  getPublicUrl(key: string): string;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
