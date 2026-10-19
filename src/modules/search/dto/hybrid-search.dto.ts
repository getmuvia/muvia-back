import { Transform, Type } from 'class-transformer';
import {
  IsNumber,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { SEARCH, SEARCH_VALIDATION } from '../search.constants';
import { ProductCondition } from '../../products/enums/product-condition.enum';
import { ProductDimension } from '../../../common/search/product-measurement';

/** Request accepted by the buyer-facing hybrid catalog search. */
export class HybridSearchDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  categoryCode?: string;

  @ValidateIf(
    (_dto: HybridSearchDto, value: unknown) =>
      value !== undefined || _dto.maxDimensionCm !== undefined,
  )
  @IsEnum(ProductDimension)
  dimension?: ProductDimension;

  @ValidateIf(
    (_dto: HybridSearchDto, value: unknown) =>
      value !== undefined || _dto.dimension !== undefined,
  )
  @IsNumber()
  @Min(1)
  @Max(10_000)
  maxDimensionCm?: number;
  @ValidateIf((_dto, value: unknown) => value !== undefined)
  @IsEnum(ProductCondition)
  condition?: ProductCondition;

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
