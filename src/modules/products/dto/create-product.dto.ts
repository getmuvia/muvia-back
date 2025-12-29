import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsUUID,
    IsNumber,
    IsPositive,
    IsArray,
    IsObject,
    Min,
    ValidateNested,
    ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateProductAssetDto } from './create-product-asset.dto';

export class CreateProductDto {
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
