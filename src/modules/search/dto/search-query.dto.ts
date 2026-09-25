import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { SEARCH_VALIDATION } from '../search.constants';

/** Request for the internal batch semantic search operation. */
export class SearchQueryDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(SEARCH_VALIDATION.MAX_BATCH_QUERIES)
  queries: string[];

  @IsNumber()
  @Min(1)
  @Max(SEARCH_VALIDATION.MAX_RESULTS_PER_QUERY)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 5;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  @Type(() => Number)
  threshold?: number = 0.5;
}
