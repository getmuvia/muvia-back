import { ProductDimension } from '../../../common/search/product-measurement';
import type {
  HybridProductResult,
  SearchInterpretationSource,
} from '../interfaces/search-result.interface';

export interface SearchInterpretationDto {
  summary: string;
  source: SearchInterpretationSource;
  category?: {
    code: string;
    label: string;
  };
  material?: {
    code: string;
    label: string;
  };
  measurement?: {
    dimension: ProductDimension;
    maxDimensionCm: number;
  };
}

export interface HybridSearchResponseDto {
  query: string;
  interpretation: SearchInterpretationDto;
  results: HybridProductResult[];
  count: number;
  relatedResults: HybridProductResult[];
}
