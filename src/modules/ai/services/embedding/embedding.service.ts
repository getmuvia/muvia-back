import { Injectable, Logger } from '@nestjs/common';
import { Product } from '../../../products/entities/product.entity';
import { VectorService } from '../vector/vector.service';
import { ProductEmbeddingRepository } from '../../repositories/product-embedding.repository';

/**
 * Generates and manages product embeddings.
 * Single Responsibility: Orchestrates embedding creation and persistence.
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(
    private readonly vectorService: VectorService,
    private readonly productEmbeddingRepository: ProductEmbeddingRepository,
  ) {}

  /**
   * Generates embedding string from product data.
   * Returns null if service unavailable or no text content.
   */
  async createForProduct(product: Partial<Product>): Promise<string | null> {
    if (!this.vectorService.isAvailable()) {
      this.logger.warn('VectorService unavailable');
      return null;
    }

    const text = this.buildSearchableText(product);
    if (!text) return null;

    return this.generateEmbeddingString(text);
  }

  /**
   * Updates a product's embedding in the database.
   * Silently fails to avoid blocking product operations.
   */
  async updateForProduct(productId: string): Promise<void> {
    try {
      const product = await this.productEmbeddingRepository.findById(productId);
      if (!product) return;

      const embedding = await this.createForProduct(product);
      if (embedding) {
        await this.productEmbeddingRepository.updateEmbedding(
          productId,
          embedding,
        );
      }
    } catch (error: unknown) {
      this.logger.error(
        `Update failed for ${productId}: ${this.errorMessage(error)}`,
      );
    }
  }

  /**
   * Regenerates embeddings that are missing or use an outdated model.
   * Returns count of successful and failed operations.
   */
  async regenerateAll(): Promise<{ updated: number; failed: number }> {
    const products =
      await this.productEmbeddingRepository.findPendingEmbeddingRefresh();
    return this.processBatch(products);
  }

  /**
   * Combines product fields into searchable text.
   * Order: title, description, keywords (most to least important).
   */
  private buildSearchableText(product: Partial<Product>): string {
    const parts: string[] = [];

    if (product.title) parts.push(product.title);
    if (product.description) parts.push(product.description);
    if (product.keywords?.length) parts.push(product.keywords.join(' '));

    return parts.join('. ');
  }

  private async generateEmbeddingString(text: string): Promise<string | null> {
    try {
      const embedding = await this.vectorService.generateEmbedding(text);
      return this.vectorService.toVectorString(embedding);
    } catch (error: unknown) {
      this.logger.error(`Generation failed: ${this.errorMessage(error)}`);
      return null;
    }
  }

  private async processBatch(
    products: Product[],
  ): Promise<{ updated: number; failed: number }> {
    let updated = 0;
    let failed = 0;

    for (const product of products) {
      const success = await this.processOne(product);
      if (success) updated += 1;
      else failed += 1;
    }

    this.logger.log(`Batch: ${updated} updated, ${failed} failed`);
    return { updated, failed };
  }

  private async processOne(product: Product): Promise<boolean> {
    try {
      const embedding = await this.createForProduct(product);
      if (!embedding) return false;

      await this.productEmbeddingRepository.updateEmbedding(
        product.id,
        embedding,
      );
      return true;
    } catch (error: unknown) {
      this.logger.error(`Product ${product.id}: ${this.errorMessage(error)}`);
      return false;
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
