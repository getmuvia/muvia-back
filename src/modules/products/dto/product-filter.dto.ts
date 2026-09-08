import { IsOptional, IsString, IsNumber, IsUUID, IsArray, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { Matches } from 'class-validator';

export class ProductFilterDto {
    @IsString()
    @Matches(/^[A-Z]{2}$/)
    @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
    @IsOptional()
    marketCode?: string = 'BO';

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
