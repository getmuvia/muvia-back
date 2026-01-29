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
// Search
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Search configuration constants.
 */
export const SEARCH = {
    /** Multiplier for fetching extra results to ensure best aren't missed */
    FETCH_MULTIPLIER: 3,

    /** Default result limit */
    DEFAULT_LIMIT: 10,

    /** Minimum similarity threshold for semantic search */
    DEFAULT_SIMILARITY_THRESHOLD: 0.3,

    /** Weights for lexical scoring */
    LEXICAL_WEIGHTS: {
        TITLE: 0.65,
        DESCRIPTION: 0.35,
    },

    /** Score boosts for matching patterns */
    SCORE_BOOSTS: {
        ALL_WORDS_FOUND: 0.2,
        PHRASE_IN_DESCRIPTION: 0.1,
        PARTIAL_TITLE_MATCH: 0.15,
        HYBRID_MATCH: 0.3,
    },
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
// GCP Defaults
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Google Cloud Platform default values.
 */
export const GCP_DEFAULTS = {
    /** Default location for Vertex AI services */
    LOCATION: 'us-central1',

    /** Default Gemini model for vision tasks */
    GEMINI_VISION_MODEL: 'gemini-1.5-pro',

    /** Default model for image generation */
    IMAGE_GENERATION_MODEL: 'gemini-2.0-flash-exp',

    /** Default embedding model */
    EMBEDDING_MODEL: 'text-embedding-004',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Input validation constants.
 */
export const VALIDATION = {
    /** Minimum query length for search */
    MIN_QUERY_LENGTH: 2,

    /** Maximum queries per batch search */
    MAX_BATCH_QUERIES: 10,

    /** Maximum results per query */
    MAX_RESULTS_PER_QUERY: 50,

    /** Maximum products to suggest */
    MAX_PRODUCTS: 20,
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

export type DesignStyle = typeof DESIGN_STYLES[number];

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

export type RoomType = typeof ROOM_TYPES[number];
