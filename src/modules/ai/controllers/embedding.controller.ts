import { Controller, Post, UseGuards } from '@nestjs/common';
import { EmbeddingService } from '../services/embedding/embedding.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../users/interfaces/user-role';

/**
 * Admin controller for embedding management operations.
 * Requires authentication and vendor role.
 */
@Controller('ai/embeddings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmbeddingController {
    constructor(private readonly embeddingService: EmbeddingService) { }

    /**
     * Regenerates embeddings for all products without one.
     * Use after enabling semantic search or updating product data.
     *
     * @returns Count of updated and failed products
     */
    @Post('regenerate')
    @Roles(UserRole.VENDOR)
    regenerate(): Promise<{ updated: number; failed: number }> {
        return this.embeddingService.regenerateAll();
    }
}
