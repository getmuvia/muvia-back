import { Controller, Post, UseGuards, Body } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { VirtualStagingService } from '../services/virtual-staging/virtual-staging.service';
import {
    VirtualStagingRequestDto,
    VirtualStagingResponseDto,
} from '../dto/virtual-staging.dto';

/**
 * Controller for virtual staging endpoints.
 * Receives image reference (key or url) and returns staged results.
 */
@Controller('ai/virtual-staging')
@UseGuards(JwtAuthGuard)
export class VirtualStagingController {
    constructor(private readonly stagingService: VirtualStagingService) { }

    /**
     * POST /ai/virtual-staging
     * 
     * Process a room image and receive a staged version with product suggestions.
     * 
     * @param dto - Request with imageKey (internal) or imageUrl (external)
     * @returns Staged image URL and suggested products
     * 
     * @example
     * 
     * { "imageKey": "virtual-staging/temp/123.jpg" }
     * 
     * 
     * { "imageUrl": "https://example.com/room.jpg" }
     */
    @Post()
    async stageRoom(
        @Body() dto: VirtualStagingRequestDto,
    ): Promise<VirtualStagingResponseDto> {
        return this.stagingService.stageRoom(dto);
    }
}
