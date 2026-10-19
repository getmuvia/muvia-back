import type { ProductMeasurementFilter } from '../../../common/search/product-measurement';
import type { ProductPriceFilter } from '../../../common/search/product-price';
import type {
  HybridProductResult,
  SearchInterpretationSource,
} from '../interfaces/search-result.interface';

export interface SearchInterpretationDto {
  summary: string;
  source: SearchInterpretationSource;
  price?: ProductPriceFilter;
  category?: {
    code: string;
    label: string;
  };
  material?: {
    code?: string;
    label: string;
  };
  measurements?: ProductMeasurementFilter[];
}

export interface HybridSearchResponseDto {
  query: string;
  interpretation: SearchInterpretationDto;
  results: HybridProductResult[];
  count: number;
  relatedResults: HybridProductResult[];
}
