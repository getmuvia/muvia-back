import type { SearchCategory } from '../../categories/category-taxonomy.service';
import type { SearchIntent } from './search-intent.interface';

export interface SearchIntentProviderInput {
  query: string;
  locale: string;
  currencyCode: string;
  supportedCurrencies: string[];
  categories: SearchCategory[];
}

export interface SearchIntentCandidate extends Omit<SearchIntent, 'text'> {
  cleanQuery: string;
}

export interface SearchIntentProvider {
  isAvailable(): boolean;
  interpret(input: SearchIntentProviderInput): Promise<SearchIntentCandidate>;
}

export const SEARCH_INTENT_PROVIDER = Symbol('SEARCH_INTENT_PROVIDER');
