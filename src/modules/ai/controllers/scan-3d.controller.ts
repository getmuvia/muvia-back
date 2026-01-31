import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';

import { CreateScan3dDto } from '../dto/scan-3d.dto';
import { Scan3dService } from '../services/scan-3d/scan-3d.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('ai/scan-3d')
export class Scan3dController {
    constructor(private readonly scan3dService: Scan3dService) {}

    @Post()
    @HttpCode(HttpStatus.ACCEPTED)
    async createScan(@Body() dto: CreateScan3dDto) {
        return await this.scan3dService.createScanJob(dto);
    }
}