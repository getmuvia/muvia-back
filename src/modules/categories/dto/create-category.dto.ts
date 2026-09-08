import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsUUID,
    IsUrl,
    Matches,
    IsBoolean,
} from 'class-validator';

export class CreateCategoryDto {
    @IsString()
    @Matches(/^[A-Z][A-Z0-9_]*$/, { message: 'Category code must use uppercase letters, numbers, and underscores' })
    code: string;

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

    @IsBoolean()
    @IsOptional()
    isSelectable?: boolean;
}
