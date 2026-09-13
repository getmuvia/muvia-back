import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  normalizeSearchText,
  searchTerms,
} from '../../common/search/search-text';
import { getSearchLocale } from '../../common/search/locales';
import type { SearchIntent } from '../ai/services/search/search-intent';
import { parseProductMeasurementSearch } from '../../common/search/product-measurement';
import { CategoryAlias } from './entities/category-alias.entity';
import { CategoryRelation } from './entities/category-relation.entity';

@Injectable()
export class CategoryTaxonomyService {
  private readonly aliasesByLocale = new Map<
    string,
    { expiresAt: number; data: CategoryAlias[] }
  >();
  private readonly relatedByCategory = new Map<
    string,
    { expiresAt: number; data: string[] }
  >();
  private readonly cacheTtlMs = 5 * 60 * 1000;

  constructor(
    @InjectRepository(CategoryAlias)
    private readonly aliasRepository: Repository<CategoryAlias>,
    @InjectRepository(CategoryRelation)
    private readonly relationRepository: Repository<CategoryRelation>,
  ) {}

  async createSearchIntent(
    query: string,
    locale = 'es-BO',
  ): Promise<SearchIntent> {
    const parsedSearch = parseProductMeasurementSearch(query, locale);
    const text = normalizeSearchText(parsedSearch.query);
    const terms = searchTerms(parsedSearch.query, locale);
    const aliases = await this.loadAliases(locale);
    const matches = aliases
      .filter((alias) => ` ${text} `.includes(` ${alias.normalizedAlias} `))
      .sort(
        (a, b) =>
          text.indexOf(a.normalizedAlias) - text.indexOf(b.normalizedAlias) ||
          b.normalizedAlias.length - a.normalizedAlias.length,
      );
    const categoryCode = matches[0]?.category.code;
    const categoryAliases = categoryCode
      ? aliases
          .filter((alias) => alias.category.code === categoryCode)
          .map((alias) => alias.normalizedAlias)
      : [];
    const aliasCategoryCodes = Object.fromEntries(
      aliases.map((alias) => [alias.normalizedAlias, alias.category.code]),
    );
    const relatedCategoryCodes = categoryCode
      ? await this.loadRelatedCategoryCodes(categoryCode)
      : [];
    const languageData = getSearchLocale(locale);

    return {
      text,
      terms,
      categoryCode,
      aliases: [...new Set(categoryAliases)],
      aliasCategoryCodes,
      relatedCategoryCodes,
      articles: languageData.articles,
      identityPrefixes: languageData.identityPrefixes,
      measurement: parsedSearch.measurement,
    };
  }

  private async loadAliases(locale: string): Promise<CategoryAlias[]> {
    const normalizedLocale = locale.replace('_', '-').toLowerCase();
    const cached = this.aliasesByLocale.get(normalizedLocale);
    if (cached && cached.expiresAt > Date.now()) return cached.data;
    const language = normalizedLocale.split('-')[0];
    const data = await this.aliasRepository
      .createQueryBuilder('alias')
      .innerJoinAndSelect('alias.category', 'category')
      .where('lower(alias.locale) IN (:...locales)', {
        locales: [...new Set([normalizedLocale, language, 'en'])],
      })
      .getMany();
    this.aliasesByLocale.set(normalizedLocale, {
      expiresAt: Date.now() + this.cacheTtlMs,
      data,
    });
    return data;
  }

  private async loadRelatedCategoryCodes(
    categoryCode: string,
  ): Promise<string[]> {
    const cached = this.relatedByCategory.get(categoryCode);
    if (cached && cached.expiresAt > Date.now()) return cached.data;
    const relations = await this.relationRepository
      .createQueryBuilder('relation')
      .innerJoin(
        'relation.sourceCategory',
        'source',
        'source.code = :categoryCode',
        { categoryCode },
      )
      .innerJoinAndSelect('relation.targetCategory', 'target')
      .where('relation.kind = :kind', { kind: 'related' })
      .getMany();
    const data = relations.map((relation) => relation.targetCategory.code);
    this.relatedByCategory.set(categoryCode, {
      expiresAt: Date.now() + this.cacheTtlMs,
      data,
    });
    return data;
  }
}
