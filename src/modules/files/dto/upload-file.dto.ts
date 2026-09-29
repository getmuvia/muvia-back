import { IsString } from 'class-validator';

export class InitUploadDto {
  @IsString()
  filename: string;

  @IsString()
  contentType: string;
}
