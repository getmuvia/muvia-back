import {
  IsString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsNumber,
  IsPositive,
  IsArray,
  IsObject,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateProductAssetDto } from './create-product-asset.dto';
import { ProductCondition } from '../enums/product-condition.enum';

export class CreateProductDto {
  @IsEnum(ProductCondition, {
    message: 'Product condition must be NEW or USED',
  })
  condition: ProductCondition = ProductCondition.NEW;

  @IsString()
  @IsNotEmpty({ message: 'Product title is required' })
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'Price must be a positive number' })
  price: number;

  @IsNumber()
  @Min(0, { message: 'Stock cannot be negative' })
  @IsOptional()
  stock?: number;

  @IsUUID('4', { message: 'Category ID must be a valid UUID' })
  @IsOptional()
  categoryId?: string;

  @IsObject()
  @IsOptional()
  specifications?: Record<string, unknown>;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  keywords?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductAssetDto)
  @IsOptional()
  assets?: CreateProductAssetDto[];
}
