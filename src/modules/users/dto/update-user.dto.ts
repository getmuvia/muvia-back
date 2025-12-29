import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';
import { IsOptional, IsString, MinLength, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateVendorProfileDto } from './create-vendor-profile.dto';

export class UpdateUserDto extends PartialType(
    OmitType(CreateUserDto, ['email', 'role', 'password'] as const),
) {
    @IsOptional()
    @IsString()
    @MinLength(8, { message: 'Password must be at least 8 characters long' })
    @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
        message:
            'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
    })
    password?: string;

    @IsOptional()
    @ValidateNested()
    @Type(() => CreateVendorProfileDto)
    vendorProfile?: CreateVendorProfileDto;
}
