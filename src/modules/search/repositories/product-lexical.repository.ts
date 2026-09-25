import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  VALID_PRODUCT_DIMENSION_PATTERN,
  productDimensionCmSql,
} from '../../../common/search/product-measurement';
import { normalizedSearchSql } from '../../../common/search/search-text';
import { Product } from '../../products/entities/product.entity';
import type { SearchIntent } from '../interfaces/search-intent.interface';

/** Encapsulates normalized text retrieval for catalog search. */
@Injectable()
export class ProductLexicalRepository {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async search(
    intent: SearchIntent,
    limit: number,
    marketCode: string,
  ): Promise<Product[]> {
    const terms = [...new Set([...intent.terms, ...intent.aliases])];
    if (!terms.length && !intent.measurement) return [];

    const title = `(' ' || ${normalizedSearchSql('product.title')} || ' ')`;
    const keywords = `(' ' || ${normalizedSearchSql("array_to_string(product.keywords, ' ')")} || ' ')`;
    const description = `(' ' || ${normalizedSearchSql('product.description')} || ' ')`;
    const material = `(' ' || ${normalizedSearchSql("product.specifications ->> 'material'")} || ' ')`;
    const parameters = Object.fromEntries(
      terms.map((term, index) => [
        `term${index}`,
        !intent.categoryCode && terms.length === 1 && term.length >= 3
          ? `% ${term}%`
          : `% ${term} %`,
      ]),
    );
    const conditions = terms.map(
      (_, index) =>
        `(${title} LIKE :term${index} OR ${keywords} LIKE :term${index} OR ${description} LIKE :term${index} OR ${material} LIKE :term${index})`,
    );
    const rank = terms
      .map((term, index) => {
        const typeWeight = intent.aliases.includes(term) ? 10 : 1;
        return `(CASE WHEN ${title} LIKE :term${index} THEN ${typeWeight * 3} ELSE 0 END
        + CASE WHEN ${keywords} LIKE :term${index} THEN ${typeWeight * 2} ELSE 0 END
        + CASE WHEN ${description} LIKE :term${index} THEN 1 ELSE 0 END
        + CASE WHEN ${material} LIKE :term${index} THEN 2 ELSE 0 END)`;
      })
      .join(' + ');

    const queryBuilder = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.assets', 'assets')
      .leftJoinAndSelect('product.category', 'category')
      .innerJoinAndSelect(
        'product.listings',
        'listing',
        'listing.marketCode = :marketCode AND listing.isActive = true',
        { marketCode },
      )
      .where(
        conditions.length ? `(${conditions.join(' OR ')})` : '1 = 1',
        parameters,
      );

    if (intent.measurement) {
      queryBuilder.andWhere(
        `${productDimensionCmSql('product', intent.measurement.dimension, ':validDimension')} <= :maxDimensionCm`,
        {
          validDimension: VALID_PRODUCT_DIMENSION_PATTERN,
          maxDimensionCm: intent.measurement.maxDimensionCm,
        },
      );
    }

    if (terms.length) {
      queryBuilder
        .addSelect(`(${rank})`, 'search_rank')
        .orderBy('search_rank', 'DESC')
        .addOrderBy('product.createdAt', 'DESC');
    } else {
      queryBuilder.orderBy('product.createdAt', 'DESC');
    }

    return queryBuilder
      .addOrderBy('product.id', 'ASC')
      .take(limit)
      .getMany()
      .then((products) =>
        products.map((product) => {
          const listing = product.listings[0];
          if (listing) {
            product.price = Number(listing.price);
            product.stock = listing.stock;
          }
          return product;
        }),
      );
  }
}
