import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ProductDimension } from '../../../common/search/product-measurement';

export { ProductDimension };

export class ProductFilterDto {
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  @Transform(({ value }) => {
    const marketCode: unknown = value;
    return typeof marketCode === 'string'
      ? marketCode.trim().toUpperCase()
      : marketCode;
  })
  @IsOptional()
  marketCode?: string = 'BO';

  @IsString()
  @IsOptional()
  search?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  keywords?: string[];

  @IsUUID('4')
  @IsOptional()
  categoryId?: string;

  @IsUUID('4')
  @IsOptional()
  sellerId?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  minPrice?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  maxPrice?: number;

  @ValidateIf(
    (filters: ProductFilterDto) => filters.maxDimensionCm !== undefined,
  )
  @IsEnum(ProductDimension)
  dimension?: ProductDimension;

  @ValidateIf((filters: ProductFilterDto) => filters.dimension !== undefined)
  @IsNumber()
  @Min(1)
  @Max(10000)
  @Type(() => Number)
  maxDimensionCm?: number;

  @IsNumber()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;
}
