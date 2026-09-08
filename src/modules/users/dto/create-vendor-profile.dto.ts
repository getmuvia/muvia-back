import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsObject,
    IsUrl,
    ValidateNested,
    Matches,
    MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

class BusinessHoursItemDto {
    @IsString()
    @IsNotEmpty()
    open: string;

    @IsString()
    @IsNotEmpty()
    close: string;

    @IsOptional()
    isClosed?: boolean;
}

export class BusinessHoursDto {
    @IsOptional()
    @ValidateNested()
    @Type(() => BusinessHoursItemDto)
    monday?: BusinessHoursItemDto;

    @IsOptional()
    @ValidateNested()
    @Type(() => BusinessHoursItemDto)
    tuesday?: BusinessHoursItemDto;

    @IsOptional()
    @ValidateNested()
    @Type(() => BusinessHoursItemDto)
    wednesday?: BusinessHoursItemDto;

    @IsOptional()
    @ValidateNested()
    @Type(() => BusinessHoursItemDto)
    thursday?: BusinessHoursItemDto;

    @IsOptional()
    @ValidateNested()
    @Type(() => BusinessHoursItemDto)
    friday?: BusinessHoursItemDto;

    @IsOptional()
    @ValidateNested()
    @Type(() => BusinessHoursItemDto)
    saturday?: BusinessHoursItemDto;

    @IsOptional()
    @ValidateNested()
    @Type(() => BusinessHoursItemDto)
    sunday?: BusinessHoursItemDto;
}

export class VendorLocationDto {
    @IsString()
    @Matches(/^[A-Z]{2}$/)
    countryCode: string;

    @IsString()
    @MaxLength(120)
    @IsOptional()
    region?: string;

    @IsString()
    @MaxLength(120)
    @IsOptional()
    city?: string;
}

export class CreateVendorProfileDto {
    @IsString()
    @IsNotEmpty({ message: 'Business name is required' })
    businessName: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsUrl({}, { message: 'Logo URL must be a valid URL' })
    @IsOptional()
    logoUrl?: string;

    @IsObject()
    @IsOptional()
    @ValidateNested()
    @Type(() => BusinessHoursDto)
    businessHours?: BusinessHoursDto;

    @IsObject()
    @ValidateNested()
    @Type(() => VendorLocationDto)
    @IsOptional()
    location?: VendorLocationDto;
}
