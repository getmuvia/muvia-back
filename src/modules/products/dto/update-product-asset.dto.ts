import { PartialType } from '@nestjs/mapped-types';
import { CreateProductAssetDto } from './create-product-asset.dto';

export class UpdateProductAssetDto extends PartialType(CreateProductAssetDto) { }
