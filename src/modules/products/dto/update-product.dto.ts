import { IntersectionType, PartialType, OmitType } from '@nestjs/mapped-types';
import {
  IsArray,
  IsEnum,
  IsOptional,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateProductDto } from './create-product.dto';
import { SyncProductAssetDto } from './sync-product-asset.dto';
import { ProductCondition } from '../enums/product-condition.enum';
import { ProductAvailabilityDto } from './product-availability.dto';

export class UpdateProductDto extends IntersectionType(
  PartialType(
    OmitType(CreateProductDto, [
      'assets',
      'condition',
      'availabilityMode',
      'leadTimeMinDays',
      'leadTimeMaxDays',
      'acceptsCustomDimensions',
    ] as const),
  ),
  ProductAvailabilityDto,
) {
  // Creation defaults must not reset an existing condition during PATCH.
  @ValidateIf((_dto, value: unknown) => value !== undefined)
  @IsEnum(ProductCondition, {
    message: 'Product condition must be NEW or USED',
  })
  condition?: ProductCondition;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncProductAssetDto)
  @IsOptional()
  assets?: SyncProductAssetDto[];
}
