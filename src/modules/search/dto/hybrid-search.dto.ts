import { Transform, Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { SEARCH, SEARCH_VALIDATION } from '../search.constants';

/** Request accepted by the buyer-facing hybrid catalog search. */
export class HybridSearchDto {
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsOptional()
  marketCode?: string = 'BO';

  @IsString()
  @MaxLength(35)
  @IsOptional()
  locale?: string = 'es-BO';

  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  @MinLength(SEARCH_VALIDATION.MIN_QUERY_LENGTH)
  @MaxLength(SEARCH_VALIDATION.MAX_QUERY_LENGTH)
  query: string;

  @IsNumber()
  @Min(1)
  @Max(SEARCH_VALIDATION.MAX_RESULTS_PER_QUERY)
  @IsOptional()
  @Type(() => Number)
  limit?: number = SEARCH.DEFAULT_LIMIT;
}
