import { IsString, IsNotEmpty, Matches } from 'class-validator';

export class CreateScan3dDto {

    @IsString()
    @IsNotEmpty()
    @Matches(/\.(mp4|mov|avi)$/i, { message: 'El archivo debe ser un video (.mp4, .mov, .avi)' })
    videoFilename: string;
}