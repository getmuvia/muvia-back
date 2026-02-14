import { Inject, Injectable, Logger } from '@nestjs/common';
import { CreateScan3dDto } from '../../dto/scan-3d.dto';
import type { IScan3DProvider } from '../../interfaces/scan-3d-provider.interface';
import { SCAN_3D_PROVIDER } from '../../interfaces/scan-3d-provider.interface';

@Injectable()
export class Scan3dService {
    private readonly logger = new Logger(Scan3dService.name);

    constructor(
        @Inject(SCAN_3D_PROVIDER) private readonly scan3DProvider: IScan3DProvider,
    ) {}

    async createScanJob(dto: CreateScan3dDto) {
        this.logger.log(`🎥 3D scan request received for: ${dto.videoFilename}`);
        
        // You could add extra logic here:
        // - Verify the video actually exists in Storage before spending money.
        // - Save the "PENDING" status in your database to display it to the user.
        
        const result = await this.scan3DProvider.start3DScan(dto.videoFilename);
        
        return {
            success: true,
            message: '3D scan job started successfully',
            jobId: result.jobId,
            estimatedTime: '15-20 minutes',

            futureDownloadUrl: result.outputUrl 
        };
    }
}
