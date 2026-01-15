import { PartialType } from '@nestjs/mapped-types';
import { CreateVendorProfileDto } from './create-vendor-profile.dto';
import {
    IsString,
    IsOptional,
    IsUrl,
    MaxLength,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SocialLinkDto {
    @IsString()
    name: string;

    @IsUrl()
    url: string;

    @IsString()
    icon: string;
}

export class UpdateVendorProfileDto extends PartialType(CreateVendorProfileDto) {
    @IsUrl({}, { message: 'Cover image must be a valid URL' })
    @IsOptional()
    coverImage?: string;

    @IsString()
    @MaxLength(150, { message: 'About me must be at most 150 characters' })
    @IsOptional()
    aboutMe?: string;

    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => SocialLinkDto)
    socialLinks?: SocialLinkDto[];
}
