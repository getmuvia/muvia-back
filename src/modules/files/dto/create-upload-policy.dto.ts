import { IsEnum, IsInt, IsString, Max, Min } from 'class-validator';
import { FileUploadPurpose } from '../file-upload-policy';

export class CreateUploadPolicyDto {
  @IsEnum(FileUploadPurpose)
  purpose: FileUploadPurpose;

  @IsString()
  contentType: string;

  @IsInt()
  @Min(1)
  @Max(50 * 1024 * 1024)
  fileSize: number;
}
