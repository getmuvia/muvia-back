import { IsOptional, IsString, IsNumber, IsUUID, IsArray, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class ProductFilterDto {
    @IsString()
    @IsOptional()
    search?: string;

    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    keywords?: string[];

    @IsUUID('4')
    @IsOptional()
    categoryId?: string;

    @IsUUID('4')
    @IsOptional()
    sellerId?: string;

    @IsNumber()
    @Min(0)
    @IsOptional()
    @Type(() => Number)
    minPrice?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    @Type(() => Number)
    maxPrice?: number;

    @IsNumber()
    @Min(1)
    @IsOptional()
    @Type(() => Number)
    page?: number = 1;

    @IsNumber()
    @Min(1)
    @Max(100)
    @IsOptional()
    @Type(() => Number)
    limit?: number = 20;
}
