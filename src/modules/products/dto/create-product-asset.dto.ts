import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsEnum,
    IsUrl,
    IsBoolean,
    IsObject,
} from 'class-validator';
import { AssetType } from '../enums/asset-type.enum';

export class CreateProductAssetDto {
    @IsUrl({}, { message: 'Asset URL must be a valid URL' })
    @IsNotEmpty({ message: 'Asset URL is required' })
    url: string;

    @IsEnum(AssetType, { message: 'Type must be image or model_3d' })
    @IsOptional()
    type?: AssetType;

    @IsBoolean()
    @IsOptional()
    isPrimary?: boolean;

    @IsObject()
    @IsOptional()
    metadata?: Record<string, unknown>;
}
