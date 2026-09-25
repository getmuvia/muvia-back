import { ProductDimension } from '../../../common/search/product-measurement';

export interface SearchIntentProviderInput {
  query: string;
  locale: string;
}

export interface SearchIntentCandidate {
  category?: string;
  material?: string;
  measurement?: {
    dimension: ProductDimension;
    maxDimensionCm: number;
  };
}

/** Port implemented by the model used to interpret natural-language searches. */
export interface SearchIntentProvider {
  isAvailable(): boolean;
  interpret(input: SearchIntentProviderInput): Promise<SearchIntentCandidate>;
}

export const SEARCH_INTENT_PROVIDER = Symbol('SEARCH_INTENT_PROVIDER');
