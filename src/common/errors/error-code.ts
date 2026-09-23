export const ERROR_CODES = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INVALID_CURRENT_PASSWORD: 'INVALID_CURRENT_PASSWORD',
  EMAIL_ALREADY_REGISTERED: 'EMAIL_ALREADY_REGISTERED',
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
  PRODUCT_FORBIDDEN: 'PRODUCT_FORBIDDEN',
  PRODUCT_LISTING_NOT_FOUND: 'PRODUCT_LISTING_NOT_FOUND',
  PRODUCT_ASSET_NOT_FOUND: 'PRODUCT_ASSET_NOT_FOUND',
  PRODUCT_ASSET_MISMATCH: 'PRODUCT_ASSET_MISMATCH',
  CATEGORY_NOT_FOUND: 'CATEGORY_NOT_FOUND',
  CATEGORY_NOT_SELECTABLE: 'CATEGORY_NOT_SELECTABLE',
  VENDOR_LOCATION_REQUIRED: 'VENDOR_LOCATION_REQUIRED',
  MARKET_NOT_AVAILABLE: 'MARKET_NOT_AVAILABLE',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface CodedErrorPayload {
  code: ErrorCode;
  message: string | string[];
}

const KNOWN_ERROR_CODES = new Set<string>(Object.values(ERROR_CODES));

export function createErrorPayload(
  code: ErrorCode,
  message: string | string[],
): CodedErrorPayload {
  return { code, message };
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && KNOWN_ERROR_CODES.has(value);
}
