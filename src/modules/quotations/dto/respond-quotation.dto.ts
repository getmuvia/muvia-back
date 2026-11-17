import {
  IsIn,
  IsInt,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { QUOTATION_LIMITS, QuotationStatus } from '../quotation.constants';

export class RespondQuotationDto {
  @IsIn([QuotationStatus.QUOTED, QuotationStatus.DECLINED])
  status: QuotationStatus.QUOTED | QuotationStatus.DECLINED;

  @ValidateIf(
    (dto: RespondQuotationDto) => dto.status === QuotationStatus.QUOTED,
  )
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(QUOTATION_LIMITS.maximumPrice)
  price?: number;

  @ValidateIf(
    (dto: RespondQuotationDto) => dto.status === QuotationStatus.QUOTED,
  )
  @IsInt()
  @Min(1)
  @Max(QUOTATION_LIMITS.maximumProductionDays)
  leadTimeMinDays?: number;

  @ValidateIf(
    (dto: RespondQuotationDto) => dto.status === QuotationStatus.QUOTED,
  )
  @IsInt()
  @Min(1)
  @Max(QUOTATION_LIMITS.maximumProductionDays)
  leadTimeMaxDays?: number;

  @IsString()
  @MaxLength(QUOTATION_LIMITS.notesLength)
  message: string;
}
