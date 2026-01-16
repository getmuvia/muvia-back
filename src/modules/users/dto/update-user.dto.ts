import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';
import { IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { UpdateVendorProfileDto } from './update-vendor-profile.dto';

export class UpdateUserDto extends PartialType(
    OmitType(CreateUserDto, ['email', 'role', 'password', 'vendorProfile'] as const),
) {

    @IsOptional()
    @ValidateNested()
    @Type(() => UpdateVendorProfileDto)
    vendorProfile?: UpdateVendorProfileDto;
}
