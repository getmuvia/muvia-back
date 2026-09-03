import { Controller, Post, Get, UseGuards, Body } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { VirtualStagingService } from '../services/virtual-staging/virtual-staging.service';
import {
    VirtualStagingQuotaDto,
    VirtualStagingRequestDto,
    VirtualStagingResponseDto,
} from '../dto/virtual-staging.dto';

/**
 * Controller for virtual staging endpoints.
 * Receives an image reference and the selected catalog product, then returns the staged result.
 */
@Controller('ai/virtual-staging')
@UseGuards(JwtAuthGuard)
export class VirtualStagingController {
    constructor(private readonly stagingService: VirtualStagingService) { }

    @Get('quota')
    async getQuota(
        @CurrentUser('id') userId: string,
    ): Promise<VirtualStagingQuotaDto> {
        return this.stagingService.getQuota(userId);
    }

    /**
     * POST /ai/virtual-staging
     * 
     * Process a room image with the catalog product selected by the user.
     * 
     * @param dto - Request with productId and imageKey (internal) or imageUrl (external)
     * @returns Staged image URL and the product used as visual reference
     * 
     * @example
     * 
     * { "imageKey": "virtual-staging/temp/123.jpg", "productId": "2ebbb0f8-6ef5-4bcb-9fcb-7e4afb1b418a" }
     * 
     * 
     * { "imageUrl": "https://example.com/room.jpg", "productId": "2ebbb0f8-6ef5-4bcb-9fcb-7e4afb1b418a" }
     */
    @Post()
    async stageRoom(
        @Body() dto: VirtualStagingRequestDto,
        @CurrentUser('id') userId: string,
    ): Promise<VirtualStagingResponseDto> {
        return this.stagingService.stageRoom(dto, userId);
    }
}
