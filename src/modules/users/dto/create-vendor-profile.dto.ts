import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsObject,
    IsUrl,
    ValidateNested,
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
    @ValidateNested({ each: true })
    @Type(() => BusinessHoursItemDto)
    businessHours?: Record<string, BusinessHoursItemDto>;
}
