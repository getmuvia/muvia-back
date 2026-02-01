import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VertexAI, GenerativeModel } from '@google-cloud/vertexai';
import {
    IVisionProvider,
    RoomAnalysisResult,
    ImageSourceInput,
} from '../../interfaces/vision-provider.interface';
import { RetryService, ImageResolverService } from '../../core';
import { ROOM_ANALYSIS_PROMPT } from '../../prompts';

@Injectable()
export class GeminiVisionProvider implements IVisionProvider {
    private readonly logger = new Logger(GeminiVisionProvider.name);
    private readonly vertexAI: VertexAI;
    private readonly model: GenerativeModel;
    private readonly MODEL_NAME: string;

    constructor(
        private readonly configService: ConfigService,
        private readonly retryService: RetryService,
        private readonly imageResolver: ImageResolverService,
    ) {
        const projectId = this.configService.get<string>('GCP_PROJECT_ID');
        const location = this.configService.get<string>('GCP_LOCATION', 'us-central1');
        this.MODEL_NAME = this.configService.get<string>('GCP_GEMINI_MODEL', 'gemini-2.5-flash');

        if (!projectId) {
            this.logger.error('GCP_PROJECT_ID not configured');
            throw new Error('GCP_PROJECT_ID is required for GeminiVisionProvider');
        }

        this.vertexAI = new VertexAI({ project: projectId, location });
        this.model = this.vertexAI.getGenerativeModel({ model: this.MODEL_NAME });
        this.logger.log(`✅ GeminiVisionProvider initialized (${this.MODEL_NAME})`);
    }

    async analyzeRoom(input: ImageSourceInput): Promise<RoomAnalysisResult> {
        this.imageResolver.validateSource(input);
        const imagePart = await this.imageResolver.toGeminiPart(input);
        this.logger.debug(`Analyzing room via ${input.key ? 'GCS' : 'URL'}...`);

        try {
            const response = await this.retryService.withExponentialBackoff(
                () => this.model.generateContent({
                    contents: [{ role: 'user', parts: [imagePart, { text: ROOM_ANALYSIS_PROMPT.template }] }],
                    generationConfig: ROOM_ANALYSIS_PROMPT.generationConfig,
                }),
                {
                    operationName: `Gemini Vision (${this.MODEL_NAME})`,
                    isRetryable: (err) => this.retryService.isQuotaExceededError(err),
                    initialDelayMs: 2000,
                },
            );

            const text = response.response.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) throw new Error('No response from Gemini Vision');

            return this.parseResponse(text);
        } catch (error) {
            this.logger.error(`Room analysis failed: ${error.message}`);
            throw error;
        }
    }

    private parseResponse(text: string): RoomAnalysisResult {
        try {
            const cleanJson = text.replace(/```json\n?|\n?```/g, '').trim();
            const parsed = JSON.parse(cleanJson);

            return {
                roomType: parsed.roomType || 'unknown',
                style: parsed.style || 'modern',
                emptyAreas: Array.isArray(parsed.emptyAreas) ? parsed.emptyAreas : [],
                suggestedFurniture: Array.isArray(parsed.suggestedFurniture) ? parsed.suggestedFurniture : [],
                colorPalette: Array.isArray(parsed.colorPalette) ? parsed.colorPalette : [],
                dimensions: parsed.dimensions,
            };
        } catch (error) {
            this.logger.error(`Failed to parse response: ${text}`);
            throw new Error('Invalid response format from vision model');
        }
    }
}
