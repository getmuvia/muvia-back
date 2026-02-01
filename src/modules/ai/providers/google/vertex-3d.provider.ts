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

    async start3DScan(videoFilename: string): Promise<Scan3DResult> {
        this.logger.log(`🚀 Starting 3D Scan: ${videoFilename}`);

        const workerPoolSpecs = [{
            machineSpec: {
                machineType: 'g2-standard-4',
                acceleratorType: 'NVIDIA_L4',
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

            this.logger.log(`✅ Job Created: ${jobId}`);

            const outputName = videoFilename.replace(/\.(mp4|mov|avi)$/i, '') + '.glb';
            const outputUrl = `https://storage.googleapis.com/${this.bucketName}/outputs/${outputName}`;

            return { jobId, status: 'PENDING', outputUrl };
        } catch (error) {
            this.logger.error(`❌ Failed to create Custom Job: ${error.message}`);
            throw error;
        }
    }
}
