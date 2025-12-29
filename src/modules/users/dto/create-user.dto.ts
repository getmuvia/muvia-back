import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  Matches,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '../interfaces/user-role';
import { CreateVendorProfileDto } from './create-vendor-profile.dto';

export class CreateUserDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
  })
  password: string;

  @IsEnum(UserRole, { message: 'Invalid role. Must be admin, vendor, or consumer' })
  @IsNotEmpty({ message: 'Role is required' })
  role: UserRole;

  @ValidateIf((o) => o.role === UserRole.VENDOR)
  @IsNotEmpty({ message: 'Vendor profile is required for vendor role' })
  @ValidateNested()
  @Type(() => CreateVendorProfileDto)
  @IsOptional()
  vendorProfile?: CreateVendorProfileDto;
}
