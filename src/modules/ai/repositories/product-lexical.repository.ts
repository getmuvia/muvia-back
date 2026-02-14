import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../../products/entities/product.entity';

/**
 * Repository for lexical (text) product search.
 * Encapsulates SQL/QueryBuilder logic to avoid coupling AI module to ProductsService.
 */
@Injectable()
export class ProductLexicalRepository {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  /**
   * Simple ILIKE search over title/description.
   * Loads assets so callers can derive primary image.
   */
  async search(query: string, limit: number): Promise<Product[]> {
    const q = `%${query}%`;

    return this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.assets', 'assets')
      .where('(product.title ILIKE :q OR product.description ILIKE :q)', { q })
      .orderBy('product.createdAt', 'DESC')
      .take(limit)
      .getMany();
  }
}
