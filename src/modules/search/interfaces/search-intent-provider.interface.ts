import type { SearchCategory } from '../../categories/category-taxonomy.service';
import type { SearchIntent } from './search-intent.interface';

export interface SearchIntentProviderInput {
  query: string;
  locale: string;
  marketCode: string;
  currencyCode: string;
  supportedCurrencies: string[];
  categories: SearchCategory[];
  selected: Pick<SearchIntent, 'categoryCode' | 'condition' | 'measurements'>;
}

export interface SearchIntentCandidate extends Omit<SearchIntent, 'text'> {
  cleanQuery: string;
  productTerms: string[];
}

export interface SearchIntentProvider {
  isAvailable(): boolean;
  interpret(input: SearchIntentProviderInput): Promise<SearchIntentCandidate>;
}

export const SEARCH_INTENT_PROVIDER = Symbol('SEARCH_INTENT_PROVIDER');
