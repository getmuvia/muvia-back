import { Type } from 'class-transformer';
import { IsIn, IsInt, Max, Min } from 'class-validator';
import { QUOTATION_LIMITS, type QuotationView } from '../quotation.constants';

export class QuotationFilterDto {
  @IsIn(['sent', 'received'])
  view: QuotationView = 'sent';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(QUOTATION_LIMITS.maximumPageSize)
  limit: number = QUOTATION_LIMITS.defaultPageSize;
}
