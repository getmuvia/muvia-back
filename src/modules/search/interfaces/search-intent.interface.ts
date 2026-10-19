import type { ProductPriceFilter } from '../../../common/search/product-price';
import type { ProductMeasurementFilter } from '../../../common/search/product-measurement';
import type { ProductCondition } from '../../products/enums/product-condition.enum';
import type { SearchInterpretationDto } from '../dto/search-response.dto';

export interface SearchIntent {
  text: string;
  terms: string[];
  categoryCode?: string;
  material?: { label: string; aliases: string[] };
  measurement?: ProductMeasurementFilter;
  price?: ProductPriceFilter;
  condition?: ProductCondition;
}

export interface ResolvedSearchIntent {
  intent: SearchIntent;
  interpretation: SearchInterpretationDto;
}
