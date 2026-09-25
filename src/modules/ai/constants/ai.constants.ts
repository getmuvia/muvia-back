/**
 * AI Module Constants
 *
 * Centralized configuration values for the AI module.
 * Using constants instead of magic numbers improves:
 * - Readability: Clear meaning of values
 * - Maintainability: Single place to update
 * - Testability: Easy to mock/override
 */

// ─────────────────────────────────────────────────────────────────────────────
// Virtual Staging
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Virtual staging configuration constants.
 */
export const VIRTUAL_STAGING = {
  /** Maximum number of product images to include as visual references */
  MAX_REFERENCE_IMAGES: 3,

  /** Default maximum products to suggest if not specified */
  DEFAULT_MAX_PRODUCTS: 4,

  /** Number of products to fetch per search query */
  SEARCH_RESULTS_PER_QUERY: 5,

  /** Maximum furniture items to use for search queries */
  MAX_FURNITURE_QUERIES: 3,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Retry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retry configuration constants.
 */
export const RETRY = {
  /** Default maximum retry attempts */
  MAX_RETRIES: 3,

  /** Default initial delay in milliseconds */
  INITIAL_DELAY_MS: 1000,

  /** Initial delay for Gemini/Vertex AI calls (higher due to quota) */
  AI_INITIAL_DELAY_MS: 2000,

  /** Maximum delay cap in milliseconds */
  MAX_DELAY_MS: 30000,

  /** Backoff multiplier */
  BACKOFF_MULTIPLIER: 2,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Design Styles
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Supported design styles for virtual staging.
 */
export const DESIGN_STYLES = [
  'modern',
  'minimalist',
  'rustic',
  'industrial',
  'scandinavian',
  'bohemian',
  'traditional',
  'contemporary',
] as const;

export type DesignStyle = (typeof DESIGN_STYLES)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Room Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Common room types detected by vision AI.
 */
export const ROOM_TYPES = [
  'living room',
  'bedroom',
  'dining room',
  'office',
  'kitchen',
  'bathroom',
  'studio',
  'loft',
] as const;

export type RoomType = (typeof ROOM_TYPES)[number];
