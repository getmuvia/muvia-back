import type { ProductMeasurementFilter } from '../../common/search/product-measurement';
import type { ProductPriceFilter } from '../../common/search/product-price';
import type { ProductCondition } from '../products/enums/product-condition.enum';
import type { SearchIntent } from './interfaces/search-intent.interface';

export interface SearchScope {
  readonly marketCode: string;
  readonly limit: number;
}

export interface SearchFilters {
  readonly categoryCode?: string;
  readonly condition?: ProductCondition;
  readonly price?: ProductPriceFilter;
  readonly measurements?: readonly ProductMeasurementFilter[];
  readonly materialAliases?: readonly string[];
}

interface SearchCriteria {
  readonly text: string;
  readonly terms: readonly string[];
  readonly productTerms: readonly string[];
}

export interface VectorSearchRequest {
  readonly embedding: string;
  readonly scope: SearchScope;
  readonly filters?: SearchFilters;
  readonly threshold: number;
}

/** Effective retrieval criteria, independent of HTTP input and AI interpretation. */
export class SearchQuery {
  readonly scope: SearchScope;
  readonly criteria: SearchCriteria;
  readonly filters: SearchFilters;

  constructor({
    scope,
    criteria,
    filters = {},
  }: {
    scope: SearchScope;
    criteria: SearchCriteria;
    filters?: SearchFilters;
  }) {
    this.scope = scope;
    this.criteria = criteria;
    this.filters = filters;
  }

  static fromIntent({
    scope,
    intent,
  }: {
    scope: SearchScope;
    intent: SearchIntent;
  }): SearchQuery {
    return new SearchQuery({
      scope,
      criteria: {
        text: intent.text,
        terms: intent.terms,
        productTerms: intent.productTerms ?? [],
      },
      filters: {
        categoryCode: intent.categoryCode,
        condition: intent.condition,
        price: intent.price,
        measurements: intent.measurements,
        materialAliases: intent.material?.aliases,
      },
    });
  }

  hasSearchCriteria(): boolean {
    return Boolean(this.criteria.text.trim()) || this.hasLexicalCriteria();
  }

  hasLexicalCriteria(): boolean {
    const hasTerms =
      this.criteria.terms.length > 0 || this.criteria.productTerms.length > 0;
    const { categoryCode, condition, price, measurements, materialAliases } =
      this.filters;
    const hasFilters = Boolean(
      categoryCode ||
      condition ||
      price ||
      measurements?.length ||
      materialAliases?.length,
    );
    return hasTerms || hasFilters;
  }

  /** Relaxes inferred preferences while retaining buyer-selected and numeric filters. */
  broaden(selectedCategoryCode?: string): SearchQuery | undefined {
    const canBroadenCategory = Boolean(
      this.filters.categoryCode && !selectedCategoryCode,
    );
    const canBroadenMaterial = Boolean(this.filters.materialAliases?.length);
    if (!canBroadenCategory && !canBroadenMaterial) return undefined;

    const broader = new SearchQuery({
      scope: this.scope,
      criteria: this.criteria,
      filters: {
        ...this.filters,
        categoryCode: selectedCategoryCode,
        materialAliases: [],
      },
    });
    return broader.hasSearchCriteria() ? broader : undefined;
  }
}
