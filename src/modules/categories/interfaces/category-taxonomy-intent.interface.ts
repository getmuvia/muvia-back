import type { MaterialSearchIntent } from '../../../common/search/product-material';
import type { ProductMeasurementFilter } from '../../../common/search/product-measurement';

/** Taxonomy and deterministic constraints resolved from a catalog query. */
export interface CategoryTaxonomyIntent {
  text: string;
  terms: string[];
  categoryCode?: string;
  categoryLabel?: string;
  aliases: string[];
  aliasCategoryCodes: Readonly<Record<string, string>>;
  relatedCategoryCodes: string[];
  articles: readonly string[];
  identityPrefixes: readonly string[];
  measurement?: ProductMeasurementFilter;
  material?: MaterialSearchIntent;
}
