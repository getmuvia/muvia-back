import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { normalizeSearchText } from '../../../common/search/search-text';
import { productMeasurementFiltersSql } from '../../../common/search/product-measurement';
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
    materialAliases: string[] = intent.material?.aliases ?? [],
  ): Promise<Product[]> {
    const terms = [
      ...new Set([...intent.terms, ...(intent.productTerms ?? [])]),
    ];
    if (
      !terms.length &&
      !intent.measurements?.length &&
      !intent.price &&
      !intent.categoryCode &&
      !condition &&
      !categoryCode &&
      !materialAliases.length
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
    if (terms.length) {
      const patterns = terms.map(
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
          `(SELECT COUNT(*) FROM unnest(CAST(:patterns AS text[])) AS term(pattern)
            WHERE ${columns.map((column) => `product.${column} LIKE term.pattern`).join(' OR ')})`,
          'term_matches',
        )
        .addSelect(
          'word_similarity(:query, product.searchTitle)',
          'search_rank',
        )
        .setParameter('query', normalizeSearchText(intent.text))
        .orderBy('term_matches', 'DESC')
        .addOrderBy('search_rank', 'DESC');
      if (intent.productTerms?.length) {
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
            productPatterns: intent.productTerms.map(
              (term) => '% ' + normalizeSearchText(term) + '%',
            ),
          },
        );
      }
    } else query.orderBy('product.createdAt', 'DESC');
    if (materialAliases.length) {
      query.andWhere(
        'product.searchMaterial LIKE ANY(CAST(:materialPatterns AS text[]))',
        {
          materialPatterns: materialAliases.map(
            (alias) => '% ' + normalizeSearchText(alias) + ' %',
          ),
        },
      );
    }
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
    let measurementParameter = 0;
    for (const filter of productMeasurementFiltersSql(
      'product',
      intent.measurements ?? [],
      (value) => {
        const key = `measurement${measurementParameter++}`;
        query.setParameter(key, value);
        return `:${key}`;
      },
    ))
      query.andWhere(filter);
    return query.addOrderBy('product.id', 'ASC').take(limit).getMany();
  }
}
