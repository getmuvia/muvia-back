import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IScan3DProvider, Scan3DResult } from '../../interfaces/scan-3d-provider.interface';
const aiplatform = require('@google-cloud/aiplatform');

@Injectable()
export class Vertex3DProvider implements IScan3DProvider {
    private readonly logger = new Logger(Vertex3DProvider.name);
    private readonly projectId: string;
    private readonly location: string = 'us-central1';
    private readonly bucketName: string;
    private readonly containerUri: string;

    constructor(private readonly configService: ConfigService) {
        this.projectId = this.configService.get<string>('GCP_PROJECT_ID') ?? 'itera-484104';
        this.bucketName = this.configService.get<string>('GOOGLE_STORAGE_BUCKET') ?? '';

        this.containerUri = `us-central1-docker.pkg.dev/${this.projectId}/itera-3d-repo/worker:v1`;
    }

    /**
     * Lanza un trabajo de entrenamiento en Vertex AI para convertir video a 3D.
     * @param videoFilename El nombre del archivo en la carpeta inputs/ (ej: "silla.mp4")
     */
    async start3DScan(videoFilename: string): Promise<Scan3DResult> {
        this.logger.log(`🚀 Iniciando Escaneo 3D para: ${videoFilename}`);

        // Especificaciones del Hardware (Usando tu cuota T4)
        const workerPoolSpecs = [{
            machineSpec: {
                machineType: 'n1-standard-4',
                acceleratorType: 'NVIDIA_TESLA_T4',
                acceleratorCount: 1,
            },
            replicaCount: 1,
            containerSpec: {
                imageUri: this.containerUri,
                env: [
                    { name: 'BUCKET_NAME', value: this.bucketName },
                    { name: 'VIDEO_FILENAME', value: videoFilename }
                ]
            }
        }];

        const customJob = {
            displayName: `3d-scan-${Date.now()}`,
            jobSpec: {
                workerPoolSpecs,
                // Límite de seguridad: Si tarda más de 1 hora, se cancela para no gastar dinero
                scheduling: { timeout: { seconds: 3600 } } 
            },
        };

        const jobClient = new aiplatform.v1.JobServiceClient({
            apiEndpoint: `${this.location}-aiplatform.googleapis.com`,
            projectId: this.projectId,
        });

        const parent = `projects/${this.projectId}/locations/${this.location}`;

        try {
            const [response] = await jobClient.createCustomJob({ parent, customJob });
            const jobId = response.name.split('/').pop(); 
            
            this.logger.log(`✅ Job Creado con Éxito: ${jobId}`);
            
            // Calculamos la URL donde aparecerá el modelo (Optimistic URL)
            // Asume que el worker guarda en outputs/NOMBRE.glb
            const outputName = videoFilename.replace(/\.(mp4|mov|avi)$/i, '') + '.glb';
            const outputUrl = `https://storage.googleapis.com/${this.bucketName}/outputs/${outputName}`;

            return {
                jobId,
                status: 'PENDING', // El frontend deberá consultar el estado
                outputUrl
            };
        } catch (error) {
            this.logger.error(`❌ Fallo al crear Custom Job: ${error.message}`);
            throw error;
        }
    }
}
