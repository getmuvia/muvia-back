import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsUUID,
    IsUrl,
} from 'class-validator';

export class CreateCategoryDto {
    @IsString()
    @IsNotEmpty({ message: 'Category name is required' })
    name: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsUrl({}, { message: 'Image URL must be a valid URL' })
    @IsOptional()
    imageUrl?: string;

    @IsUUID('4', { message: 'Parent ID must be a valid UUID' })
    @IsOptional()
    parentId?: string;
}
