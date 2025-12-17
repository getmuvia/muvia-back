import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '../entities/user.entity';

class CreateVendorProfileDto {
  @IsString()
  @IsNotEmpty()
  businessName: string;

  @IsString()
  @IsNotEmpty()
  description: string;
}

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateVendorProfileDto)
  vendorProfile?: CreateVendorProfileDto;
}
