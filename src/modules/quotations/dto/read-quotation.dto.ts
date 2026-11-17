import { IsISO8601, IsOptional } from 'class-validator';

export class ReadQuotationDto {
  @IsOptional()
  @IsISO8601()
  respondedAt?: string | null;
}
