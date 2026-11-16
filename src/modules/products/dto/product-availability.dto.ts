import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { ProductAvailabilityMode } from '../enums/product-availability.enum';
import { MAX_PRODUCT_LEAD_TIME_DAYS } from '../product-availability';

export class ProductAvailabilityDto {
  @ValidateIf((_dto, value: unknown) => value !== undefined)
  @IsEnum(ProductAvailabilityMode)
  availabilityMode?: ProductAvailabilityMode;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PRODUCT_LEAD_TIME_DAYS)
  leadTimeMinDays?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PRODUCT_LEAD_TIME_DAYS)
  leadTimeMaxDays?: number | null;

  @ValidateIf((_dto, value: unknown) => value !== undefined)
  @IsBoolean()
  acceptsCustomDimensions?: boolean;
}
