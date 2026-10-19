import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type SelectQueryBuilder } from 'typeorm';
import {
  normalizeSearchText,
  searchPhrasePatterns,
  searchTermPatterns,
} from '../../../common/search/search-text';
import { productMeasurementFiltersSql } from '../../../common/search/product-measurement';
import { productPriceFiltersSql } from '../../../common/search/product-price';
import { Product } from '../../products/entities/product.entity';
import { SearchQuery, type SearchFilters } from '../search-query';

@Injectable()
export class ProductLexicalRepository {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
  ) {}

  async search(search: SearchQuery): Promise<Product[]> {
    if (!search.hasLexicalCriteria()) return [];
    const { marketCode, limit } = search.scope;
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
    this.applyTextCriteria(query, search.criteria);
    this.applyFilters(query, search.filters);
    return query.addOrderBy('product.id', 'ASC').take(limit).getMany();
  }

  private applyTextCriteria(
    query: SelectQueryBuilder<Product>,
    criteria: SearchQuery['criteria'],
  ): void {
    const terms = [...new Set([...criteria.terms, ...criteria.productTerms])];
    if (!terms.length) {
      query.orderBy('product.createdAt', 'DESC');
      return;
    }
    const patterns = searchTermPatterns(terms);
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
        `(SELECT COUNT(*) FROM unnest(CAST(:patterns AS text[])) AS term(pattern)
            WHERE ${columns.map((column) => `product.${column} LIKE term.pattern`).join(' OR ')})`,
        'term_matches',
      )
      .addSelect('word_similarity(:query, product.searchTitle)', 'search_rank')
      .setParameter('query', normalizeSearchText(criteria.text))
      .orderBy('term_matches', 'DESC')
      .addOrderBy('search_rank', 'DESC');
    if (criteria.productTerms.length) {
      query.andWhere(
        '(' +
          columns
            .map(
              (column) =>
                `product.${column} LIKE ANY(CAST(:productPatterns AS text[]))`,
            )
            .join(' OR ') +
          ')',
        {
          productPatterns: searchTermPatterns(criteria.productTerms),
        },
      );
    }
  }

  private applyFilters(
    query: SelectQueryBuilder<Product>,
    filters: SearchFilters,
  ): void {
    const { categoryCode, condition, materialAliases, price, measurements } =
      filters;
    if (materialAliases?.length) {
      query.andWhere(
        'product.searchMaterial LIKE ANY(CAST(:materialPatterns AS text[]))',
        {
          materialPatterns: searchPhrasePatterns(materialAliases),
        },
      );
    }
    if (categoryCode)
      query.andWhere('category.code = :categoryCode', { categoryCode });
    if (condition !== undefined)
      query.andWhere('product.condition = :condition', { condition });
    let parameterIndex = 0;
    const bind = (value: unknown): string => {
      const key = `filter${parameterIndex++}`;
      query.setParameter(key, value);
      return `:${key}`;
    };
    const constraints = [
      ...productPriceFiltersSql(
        price,
        { currency: 'listing.currencyCode', amount: 'listing.price' },
        bind,
      ),
      ...productMeasurementFiltersSql('product', measurements ?? [], bind),
    ];
    for (const constraint of constraints) query.andWhere(constraint);
  }
}
