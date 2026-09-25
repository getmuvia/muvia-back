import type { CategoryTaxonomyIntent } from '../../categories/interfaces/category-taxonomy-intent.interface';
import type { SearchInterpretationDto } from '../dto/search-response.dto';

/** Validated catalog constraints used by repositories and ranking. */
export type SearchIntent = CategoryTaxonomyIntent;

export interface ResolvedSearchIntent {
  intent: SearchIntent;
  interpretation: SearchInterpretationDto;
}

export interface SearchableProduct {
  title: string;
  description?: string | null;
  keywords?: string[];
  categoryCode?: string | null;
  specifications?: { material?: string } | null;
}
