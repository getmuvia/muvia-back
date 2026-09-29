import { IsString, Matches } from 'class-validator';

export class FinalizeUploadDto {
  @IsString()
  @Matches(/^pending\/[a-z_]+\/[0-9a-f-]+\/[0-9a-f-]+\.[a-z0-9]+$/i)
  key: string;
}
