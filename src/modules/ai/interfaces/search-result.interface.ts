/**
 * Product result from semantic (vector) search.
 *
 * Includes similarity score indicating how closely the product
 * matches the search query embedding.
 */
export interface SearchProductResult {
    /** Unique product identifier */
    id: string;

    /** Product title */
    title: string;

    /** Product description */
    description: string | null;

    /** Search tags used to validate product identity. */
    keywords: string[];

    /** Product price */
    price: number;

    /** Available stock quantity */
    stock: number;

    /** Seller ID */
    sellerId: string;

    /** Category ID */
    categoryId: string | null;

    /** Stable category identity used for relevance filtering */
    categoryCode: string | null;

    /** Currency for the selected market listing */
    currencyCode: string;

    /** Primary product image URL */
    imageUrl: string | null;

    /** Vector similarity score (0.0 - 1.0, higher is more similar) */
    similarity: number;

    /** Product creation timestamp */
    createdAt: Date;
}

/**
 * Groups search results by their original query.
 * Used for batch processing of multiple search terms.
 */
export interface SearchResult {
    /** Original search query */
    query: string;

    /** Matching products sorted by similarity */
    products: SearchProductResult[];
}

/**
 * Product result from hybrid search with combined scoring.
 *
 * Includes match type to indicate how the product was found
 * and a combined score from semantic and lexical matching.
 */
export interface HybridProductResult {
    /** Unique product identifier */
    id: string;

    /** Product title */
    title: string;

    /** Product description */
    description: string | null;

    /** Product price */
    price: number;

    /** Currency for the selected market listing */
    currencyCode: string;

    /** Primary product image URL */
    imageUrl: string | null;

    /** Combined relevance score (0.0 - 1.0) */
    score: number;

    /**
     * How the product was matched:
     * - semantic: Found via vector similarity only
     * - lexical: Found via text matching only
     * - hybrid: Retrieved by both methods; eligibility is evaluated separately
     */
    matchType: 'semantic' | 'lexical' | 'hybrid';
}

/**
 * Response from hybrid search endpoint.
 */
export interface HybridSearchResponse {
    /** Original search query */
    query: string;

    /** Products that satisfy the requested identity/text, sorted by relevance. */
    results: HybridProductResult[];

    /** Number of main results returned (excludes related suggestions). */
    count: number;

    /** Broader suggestions, never mixed into main results. */
    relatedResults: HybridProductResult[];
}
