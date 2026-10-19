import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { normalizeSearchText } from '../../../common/search/search-text';
import {
  VALID_PRODUCT_DIMENSION_PATTERN,
  productDimensionCmSql,
} from '../../../common/search/product-measurement';
import { Product } from '../../products/entities/product.entity';
import { ProductCondition } from '../../products/enums/product-condition.enum';
import type { SearchIntent } from '../interfaces/search-intent.interface';

@Injectable()
export class ProductLexicalRepository {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
  ) {}

  async search(
    intent: SearchIntent,
    limit: number,
    marketCode: string,
    condition?: ProductCondition,
    categoryCode?: string,
  ): Promise<Product[]> {
    if (
      !intent.terms.length &&
      !intent.measurement &&
      !intent.price &&
      !intent.categoryCode &&
      !condition &&
      !categoryCode
    )
      return [];
    const query = this.products
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.assets', 'assets')
      .leftJoinAndSelect('product.category', 'category')
      .innerJoinAndSelect(
        'product.listings',
        'listing',
        'listing.marketCode = :marketCode AND listing.isActive = true',
        { marketCode },
      );
    if (intent.terms.length) {
      const patterns = intent.terms.map(
        (term) => '% ' + normalizeSearchText(term) + '%',
      );
      const columns = [
        'searchTitle',
        'searchKeywords',
        'searchDescription',
        'searchMaterial',
      ];
      query
        .where(
          '(' +
            columns
              .map(
                (column) =>
                  'product.' + column + ' LIKE ANY(CAST(:patterns AS text[]))',
              )
              .join(' OR ') +
            ')',
          { patterns },
        )
        .addSelect(
          'word_similarity(:query, product.searchTitle)',
          'search_rank',
        )
        .setParameter('query', intent.text)
        .orderBy('search_rank', 'DESC');
    } else query.orderBy('product.createdAt', 'DESC');
    if (categoryCode)
      query.andWhere('category.code = :categoryCode', { categoryCode });
    if (condition !== undefined)
      query.andWhere('product.condition = :condition', { condition });
    if (intent.price) {
      const { currencyCode, minimum, maximum } = intent.price;
      query.andWhere('listing.currencyCode = :priceCurrency', {
        priceCurrency: currencyCode,
      });
      if (minimum)
        query.andWhere(
          'listing.price ' + (minimum.inclusive ? '>=' : '>') + ' :minimum',
          { minimum: minimum.amount.toFixed(2) },
        );
      if (maximum)
        query.andWhere(
          'listing.price ' + (maximum.inclusive ? '<=' : '<') + ' :maximum',
          { maximum: maximum.amount.toFixed(2) },
        );
    }
    if (intent.measurement) {
      query.andWhere(
        productDimensionCmSql(
          'product',
          intent.measurement.dimension,
          ':validDimension',
        ) + ' <= :maximumCm',
        {
          validDimension: VALID_PRODUCT_DIMENSION_PATTERN,
          maximumCm: intent.measurement.maxDimensionCm,
        },
      );
    }
    return query.addOrderBy('product.id', 'ASC').take(limit).getMany();
  }
}
