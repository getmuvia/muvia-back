import { PartialType, OmitType } from '@nestjs/mapped-types';
import { IsArray, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateProductDto } from './create-product.dto';
import { SyncProductAssetDto } from './sync-product-asset.dto';

export class UpdateProductDto extends PartialType(
    OmitType(CreateProductDto, ['assets'] as const),
) {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SyncProductAssetDto)
    @IsOptional()
    assets?: SyncProductAssetDto[];
}

