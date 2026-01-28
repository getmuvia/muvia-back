import { Injectable, Logger, BadRequestException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PredictionServiceClient, helpers, protos } from '@google-cloud/aiplatform';
import { Storage } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';
import {
    IImageGenerator,
    ImageGenerationRequest,
    ImageGenerationResult,
} from '../../interfaces/image-generator.interface';
import type { ImageSourceInput } from '../../interfaces/vision-provider.interface';

/**
 * Google Imagen (Generic) implementation using Prediction Service (Raw API).
 * Correctly supports Imagen 3's "predict" endpoint instead of Gemini's "generateContent".
 */
@Injectable()
export class ImagenProvider implements IImageGenerator, OnModuleInit {
    private readonly logger = new Logger(ImagenProvider.name);
    private client: PredictionServiceClient;
    private readonly storage: Storage;
    private initialized = false;

    private readonly bucketName: string;
    private readonly projectId: string;
    private readonly location: string;
    private readonly MODEL_NAME: string;

    constructor(private readonly configService: ConfigService) {
        this.projectId = this.configService.get<string>('GCP_PROJECT_ID') ?? '';
        // Use us-east4 to avoid central congestion
        this.location = this.configService.get<string>('GCP_IMAGEN_LOCATION', 'us-east4');
        this.bucketName = this.configService.get<string>('GOOGLE_STORAGE_BUCKET') ?? '';
        // Default to Fast model
        this.MODEL_NAME = this.configService.get<string>('GCP_IMAGEN_MODEL', 'imagen-3.0-fast-generate-001');

        this.storage = new Storage();
    }

    onModuleInit() {
        this.initialize();
    }

    private initialize() {
        if (!this.projectId) {
            this.logger.error('GCP_PROJECT_ID not configured');
            return;
        }

        try {
            const apiEndpoint = `${this.location}-aiplatform.googleapis.com`;
            this.client = new PredictionServiceClient({ apiEndpoint });
            this.initialized = true;
            this.logger.log(`✅ ImagenProvider initialized (${this.MODEL_NAME}) on ${this.location}`);
        } catch (error) {
            this.logger.error(`Failed to initialize ImagenProvider: ${error.message}`);
        }
    }

    async generate(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
        if (!this.initialized) throw new Error('ImagenProvider not initialized');

        const startTime = Date.now();

        if (!request.imageSource.key && !request.imageSource.url) {
            throw new BadRequestException('Either imageKey or imageUrl must be provided');
        }

        this.logger.debug(`Generating image via Imagen (Predict API)...`);

        try {
            const endpoint = `projects/${this.projectId}/locations/${this.location}/publishers/google/models/${this.MODEL_NAME}`;

            // Build RAW INSTANCE (The key fix)
            const instance = await this.buildInstance(request);

            // Build PARAMETERS
            const parameters = helpers.toValue({
                sampleCount: 1,
                // aspectRatio: '1:1', // Optional
                includeRaiReasoning: true,
            });

            // Call Predict API with Retry
            const response = await this.retryWithBackoff(async () => {
                const [response] = await this.client.predict({
                    endpoint,
                    instances: [instance],
                    parameters,
                });
                return response;
            }, 5);

            // Extract Base64 Image
            const prediction = response.predictions?.[0];
            if (!prediction) throw new Error('No prediction returned from Imagen');

            const predictionValue = helpers.fromValue(prediction as any) as any;
            const base64Image = predictionValue?.bytesBase64Encoded;

            if (!base64Image) {
                // Check if it's a validation error or safety filter
                this.logger.error(`Imagen response invalid: ${JSON.stringify(predictionValue)}`);
                throw new Error('No image bytes in Imagen response');
            }

            // Upload to GCS
            const imageUrl = await this.uploadToGcs(base64Image);

            const generationTimeMs = Date.now() - startTime;
            this.logger.log(`Image generated successfully in ${generationTimeMs}ms`);

            return {
                imageUrl,
                metadata: {
                    model: this.MODEL_NAME,
                    generationTimeMs,
                },
            };

        } catch (error) {
            this.logger.error(`Imagen generation failed: ${error.message}`);
            throw error;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helper Methods
    // ─────────────────────────────────────────────────────────────────────────

    private async buildInstance(request: ImageGenerationRequest): Promise<protos.google.protobuf.IValue> {
        const prompt = this.buildPrompt(request);

        // Setup Source Image
        const sourceImage = {
            image: {
                mimeType: '',
                bytesBase64Encoded: ''
            }
        };

        if (request.imageSource.key) {
            // Native GCS support doesn't work well with Predict API sometimes, 
            // but let's try reading it or just using URI if supported? 
            // Actually, predict API usually expects base64 bytes for 'image' field inside 'prompt' structure or similar.
            // Imagen 3 Editing expects: { prompt: "...", image: { bytesBase64Encoded: "..." } }

            // Let's resolve to Base64 to be safe and consistent with "instances" format
            const file = this.storage.bucket(this.bucketName).file(request.imageSource.key);
            const [buffer] = await file.download();
            sourceImage.image.bytesBase64Encoded = buffer.toString('base64');
            sourceImage.image.mimeType = this.inferMimeType(request.imageSource.key);
        } else if (request.imageSource.url) {
            const { buffer, mimeType } = await this.downloadImage(request.imageSource.url);
            sourceImage.image.bytesBase64Encoded = buffer.toString('base64');
            sourceImage.image.mimeType = mimeType;
        }

        // Construct Instance JSON
        // For Imagen 3 (Edit/Generate), the instance format is usually:
        // { prompt: string, image: { bytesBase64Encoded: string } }
        const instanceObj = {
            prompt: prompt,
            image: {
                bytesBase64Encoded: sourceImage.image.bytesBase64Encoded
            }
        };

        return helpers.toValue(instanceObj) as protos.google.protobuf.IValue;
    }

    private buildPrompt(request: ImageGenerationRequest): string {
        let prompt = request.prompt;
        if (request.style === 'photorealistic') {
            prompt += ', photorealistic, 4k, natural lighting, interior design photography';
        }
        if (request.negativePrompt) {
            // Some versions support negativePrompt field, others need it in prompt
            // Keeping it simple in prompt for now
            prompt += ` --negative_prompt="${request.negativePrompt}"`;
        }
        return prompt;
    }

    private async retryWithBackoff<T>(
        operation: () => Promise<T>,
        maxRetries: number = 3,
        initialDelay: number = 2000,
    ): Promise<T> {
        let retries = 0;
        while (true) {
            try {
                return await operation();
            } catch (error) {
                if (!this.isRetryableError(error) || retries >= maxRetries) {
                    throw error;
                }
                const delay = initialDelay * Math.pow(2, retries);
                this.logger.warn(`Quota/Error (429/400). Retrying in ${delay}ms... (Attempt ${retries + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                retries++;
            }
        }
    }

    private isRetryableError(error: any): boolean {
        if (error?.code === 8 || error?.code === 429) return true;
        const msg = error?.message || '';
        return msg.includes('429') || msg.includes('Quota') || msg.includes('RESOURCE_EXHAUSTED');
    }

    private async uploadToGcs(base64: string): Promise<string> {
        const buffer = Buffer.from(base64, 'base64');
        const filename = `generated/imagen-${uuidv4()}.png`;
        const file = this.storage.bucket(this.bucketName).file(filename);

        await file.save(buffer, {
            contentType: 'image/png',
            metadata: { cacheControl: 'public, max-age=31536000' },
        });

        // Assuming public access or signed URL logic elsewhere, returning public link for now
        // Or if bucket is private, this might need signed URL generation.
        // For now, consistent with existing provider style (returning string).
        return `https://storage.googleapis.com/${this.bucketName}/${filename}`;
    }

    private async downloadImage(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch image: ${res.statusText}`);
        const buf = await res.arrayBuffer();
        return {
            buffer: Buffer.from(buf),
            mimeType: res.headers.get('content-type') || 'image/jpeg'
        };
    }

    private inferMimeType(key: string): string {
        const ext = key.split('.').pop()?.toLowerCase();
        if (ext === 'png') return 'image/png';
        return 'image/jpeg';
    }
}
