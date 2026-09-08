import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class StorefrontContextDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  countryCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(35)
  locale?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timeZone?: string;
}
