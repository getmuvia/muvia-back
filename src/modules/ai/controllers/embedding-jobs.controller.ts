import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ProcessEmbeddingJobDto } from '../dto/process-embedding-job.dto';
import { EmbeddingTaskAuthGuard } from '../guards/embedding-task-auth.guard';
import { EmbeddingService } from '../services/embedding/embedding.service';

@Controller('internal/embeddings')
@UseGuards(EmbeddingTaskAuthGuard)
export class EmbeddingJobsController {
  constructor(private readonly embeddings: EmbeddingService) {}

  @Post('process')
  @HttpCode(HttpStatus.OK)
  process(@Body() dto: ProcessEmbeddingJobDto) {
    return this.embeddings.process(dto.jobId);
  }

  @Post('recover')
  @HttpCode(HttpStatus.OK)
  recover() {
    return this.embeddings.recover();
  }
}
