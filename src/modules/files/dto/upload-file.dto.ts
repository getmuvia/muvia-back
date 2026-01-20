import { IsString, IsOptional } from 'class-validator';

export class UploadFileDto {
    @IsString()
    @IsOptional()
    folder?: string;
}

export class InitUploadDto {
    @IsString()
    filename: string;
    
    @IsString()
    contentType: string;
}