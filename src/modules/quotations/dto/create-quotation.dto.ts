import { Type, Transform } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  DIMENSION_UNIT_CM,
  QUOTATION_LIMITS,
  type QuotationDimensionUnit,
} from '../quotation.constants';

export class QuotationDimensionsDto {
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(Number.MIN_VALUE)
  width: number;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(Number.MIN_VALUE)
  depth: number;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(Number.MIN_VALUE)
  height: number;

  @IsIn(Object.keys(DIMENSION_UNIT_CM))
  unit: QuotationDimensionUnit;
}

export class CreateQuotationDto {
  @IsUUID()
  requestId: string;

  @IsUUID()
  productId: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Z]{2}$/)
  marketCode: string;

  @Type(() => QuotationDimensionsDto)
  @IsDefined()
  @ValidateNested()
  dimensions: QuotationDimensionsDto;

  @IsOptional()
  @IsString()
  @MaxLength(QUOTATION_LIMITS.notesLength)
  notes?: string;
}
