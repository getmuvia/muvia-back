import {
    IsString,
    IsOptional,
    IsEnum,
    IsUrl,
    IsBoolean,
    IsObject,
    IsUUID,
} from 'class-validator';
import { AssetType } from '../enums/asset-type.enum';

export class SyncProductAssetDto {
    @IsUUID('4')
    @IsOptional()
    id?: string;

    @IsUrl({}, { message: 'Asset URL must be a valid URL' })
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
