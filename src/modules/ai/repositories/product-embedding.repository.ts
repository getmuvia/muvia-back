import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AI_ENV_KEYS } from '../../../config/ai.config';
import { Product } from '../../products/entities/product.entity';

/** Persists product embeddings without exposing search query concerns. */
@Injectable()
export class ProductEmbeddingRepository {
  private readonly embeddingModel: string;

  constructor(
    @InjectRepository(Product)
    private readonly repository: Repository<Product>,
    configService: ConfigService,
  ) {
    this.embeddingModel = configService.getOrThrow<string>(
      AI_ENV_KEYS.embeddingModel,
    );
  }

  async updateEmbedding(productId: string, embedding: string): Promise<void> {
    await this.repository.query(
      `UPDATE products
       SET embedding = $1::vector, embedding_model = $2
       WHERE id = $3`,
      [embedding, this.embeddingModel, productId],
    );
  }

  async findPendingEmbeddingRefresh(): Promise<Product[]> {
    return this.repository
      .createQueryBuilder('product')
      .where('product.embedding IS NULL')
      .orWhere('product.embedding_model IS DISTINCT FROM :embeddingModel', {
        embeddingModel: this.embeddingModel,
      })
      .getMany();
  }

  async findById(productId: string): Promise<Product | null> {
    return this.repository.findOne({ where: { id: productId } });
  }
}
