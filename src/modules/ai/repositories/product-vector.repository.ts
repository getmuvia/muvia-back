import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Product } from '../../products/entities/product.entity';
import { SearchProductResult } from '../interfaces/search-result.interface';

/**
 * Repository for vector-based product operations.
 * Encapsulates all pgvector SQL queries (Single Responsibility).
 */
@Injectable()
export class ProductVectorRepository {
    private readonly logger = new Logger(ProductVectorRepository.name);

    constructor(
        @InjectRepository(Product)
        private readonly repository: Repository<Product>,
    ) { }

    /**
     * Finds products similar to the given embedding vector.
     * Uses pgvector cosine distance operator for similarity ranking.
     */
    async findBySimilarity(
        embedding: string,
        limit: number,
        threshold: number,
        marketCode = 'BO',
    ): Promise<SearchProductResult[]> {
        const raw = await this.repository.query(
            this.getSimilarityQuery(),
            [embedding, threshold, marketCode, limit],
        );

        return this.mapToResults(raw);
    }

    /**
     * Updates the embedding vector for a specific product.
     * Uses raw SQL to properly cast string to pgvector type.
     */
    async updateEmbedding(productId: string, embedding: string): Promise<void> {
        await this.repository.query(
            `UPDATE products SET embedding = $1::vector WHERE id = $2`,
            [embedding, productId],
        );
    }

    /**
     * Retrieves all products without an embedding.
     */
    async findWithoutEmbedding(): Promise<Product[]> {
        return this.repository.find({ where: { embedding: IsNull() } });
    }

    /**
     * Finds a single product by ID.
     */
    async findById(productId: string): Promise<Product | null> {
        return this.repository.findOne({ where: { id: productId } });
    }

    /**
     * SQL query using pgvector cosine distance.
     * Includes primary image via subquery for performance.
     */
    private getSimilarityQuery(): string {
        return `
            SELECT 
                p.id,
                p.title,
                p.description,
                p.keywords,
                listing.price,
                listing.stock,
                listing.currency_code as "currencyCode",
                p.seller_id as "sellerId",
                p.category_id as "categoryId",
                category.code as "categoryCode",
                p."createdAt",
                1 - (p.embedding <=> $1::vector) as similarity,
                (
                    SELECT pa.url 
                    FROM product_assets pa 
                    WHERE pa.product_id = p.id AND pa."isPrimary" = true 
                    LIMIT 1
                ) as "imageUrl"
            FROM products p
            INNER JOIN product_listings listing ON listing.product_id = p.id
              AND listing.market_code = $3 AND listing.is_active = true
            LEFT JOIN categories category ON category.id = p.category_id
            WHERE p.embedding IS NOT NULL
                AND 1 - (p.embedding <=> $1::vector) >= $2
            ORDER BY p.embedding <=> $1::vector ASC
            LIMIT $4
        `;
    }

    private mapToResults(raw: any[]): SearchProductResult[] {
        return raw.map((item) => ({
            ...item,
            similarity: parseFloat(item.similarity),
        }));
    }
}
