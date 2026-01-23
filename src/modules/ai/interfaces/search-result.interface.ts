/**
 * Represents a single product in search results.
 * Includes similarity score and primary image URL.
 */
export interface SearchProductResult {
    id: string;
    title: string;
    description: string | null;
    price: number;
    stock: number;
    sellerId: string;
    categoryId: string | null;
    imageUrl: string | null;
    similarity: number;
    createdAt: Date;
}

/**
 * Groups search results by their original query.
 * Enables batch processing of multiple search terms.
 */
export interface SearchResult {
    query: string;
    products: SearchProductResult[];
}
