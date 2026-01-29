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

    /** Product price */
    price: number;

    /** Available stock quantity */
    stock: number;

    /** Seller ID */
    sellerId: string;

    /** Category ID */
    categoryId: string | null;

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

    /** Primary product image URL */
    imageUrl: string | null;

    /** Combined relevance score (0.0 - 1.0) */
    score: number;

    /**
     * How the product was matched:
     * - semantic: Found via vector similarity only
     * - lexical: Found via text matching only
     * - hybrid: Found via both methods (highest confidence)
     */
    matchType: 'semantic' | 'lexical' | 'hybrid';
}

/**
 * Response from hybrid search endpoint.
 */
export interface HybridSearchResponse {
    /** Original search query */
    query: string;

    /** Matching products sorted by combined score */
    results: HybridProductResult[];

    /** Total number of unique results found */
    count: number;
}
