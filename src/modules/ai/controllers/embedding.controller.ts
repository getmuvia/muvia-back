import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { EmbeddingService } from '../services/embedding/embedding.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/enums/user-role.enum';

/**
 * Admin controller for embedding management operations.
 * Requires authentication and the admin role.
 */
@Controller('ai/embeddings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmbeddingController {
  constructor(private readonly embeddingService: EmbeddingService) {}

  /**
   * Regenerates embeddings that are missing or use an outdated model.
   * Use after enabling semantic search, changing models, or updating product data.
   *
   * Queues one bounded batch. Remaining products are recovered by Scheduler.
   */
  @Post('regenerate')
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles(UserRole.ADMIN)
  regenerate(): Promise<{ queued: number; dispatched: number }> {
    return this.embeddingService.enqueueRefresh();
  }
}
