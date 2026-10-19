import { Transform } from 'class-transformer';
import {
  IsISO4217CurrencyCode,
  IsNumber,
  IsPositive,
  Max,
} from 'class-validator';

export class UpdateExchangeRateDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsISO4217CurrencyCode()
  currencyCode: string;

  @IsNumber({ maxDecimalPlaces: 6 })
  @IsPositive()
  @Max(1_000_000)
  rate: number;
}
