import { IsUUID } from 'class-validator';

export class ProcessEmbeddingJobDto {
  @IsUUID('4')
  jobId: string;
}
