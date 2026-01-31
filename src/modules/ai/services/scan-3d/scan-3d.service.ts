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
        this.logger.log(`🎥 Solicitud de escaneo 3D recibida para: ${dto.videoFilename}`);
        
        // Aquí podrías añadir lógica extra:
        // - Verificar si el video realmente existe en Storage antes de gastar dinero.
        // - Guardar el estado "PENDING" en tu base de datos para mostrárselo al usuario.
        
        const result = await this.scan3DProvider.start3DScan(dto.videoFilename);
        
        return {
            success: true,
            message: 'Trabajo de escaneo 3D iniciado correctamente',
            jobId: result.jobId,
            estimatedTime: '15-20 minutos',

            futureDownloadUrl: result.outputUrl 
        };
    }
}
