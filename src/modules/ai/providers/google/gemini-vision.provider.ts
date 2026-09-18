import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import {
    IVisionProvider,
    RoomAnalysisResult,
    ImageSourceInput,
} from '../../interfaces/vision-provider.interface';
import { RetryService, ImageResolverService } from '../../core';
import { ROOM_ANALYSIS_PROMPT } from '../../prompts';
import { AI_ENV_KEYS } from '../../../../config/ai.config';
import { parseRoomAnalysisResponse } from './room-analysis-response.parser';

@Injectable()
export class GeminiVisionProvider implements IVisionProvider {
    private readonly logger = new Logger(GeminiVisionProvider.name);
    private readonly ai: GoogleGenAI;
    private readonly MODEL_NAME: string;

    constructor(
        private readonly configService: ConfigService,
        private readonly retryService: RetryService,
        private readonly imageResolver: ImageResolverService,
    ) {
        const projectId = this.configService.get<string>(AI_ENV_KEYS.projectId);
        const location = this.configService.getOrThrow<string>(AI_ENV_KEYS.visionLocation);
        this.MODEL_NAME = this.configService.getOrThrow<string>(AI_ENV_KEYS.visionModel);

        if (!projectId) {
            this.logger.error('GCP_PROJECT_ID not configured');
            throw new Error('GCP_PROJECT_ID is required for GeminiVisionProvider');
        }

        this.ai = new GoogleGenAI({
            vertexai: true,
            project: projectId,
            location,
        });
        this.logger.log(`✅ GeminiVisionProvider initialized (${this.MODEL_NAME} @ ${location})`);
    }

    async analyzeRoom(input: ImageSourceInput): Promise<RoomAnalysisResult> {
        this.imageResolver.validateSource(input);
        const imagePart = await this.buildImagePart(input);
        this.logger.debug(`Analyzing room via ${input.key ? 'GCS' : 'URL'}...`);

        try {
            const response = await this.retryService.withExponentialBackoff(
                () => this.ai.models.generateContent({
                    model: this.MODEL_NAME,
                    contents: [imagePart, { text: ROOM_ANALYSIS_PROMPT.template }],
                    config: {
                        maxOutputTokens: ROOM_ANALYSIS_PROMPT.generationConfig.maxOutputTokens,
                        responseMimeType: ROOM_ANALYSIS_PROMPT.generationConfig.responseMimeType,
                        responseSchema: ROOM_ANALYSIS_PROMPT.outputSchema,
                    },
                }),
                {
                    operationName: `Gemini Vision (${this.MODEL_NAME})`,
                    isRetryable: (err) => this.retryService.isQuotaExceededError(err),
                    initialDelayMs: 2000,
                },
            );

            if (!response.text) throw new Error('No response from Gemini Vision');
            return parseRoomAnalysisResponse(response.text);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`Room analysis failed: ${message}`);
            throw error;
        }
    }

    private async buildImagePart(input: ImageSourceInput): Promise<any> {
        const base64Data = await this.imageResolver.toBase64(input);
        const mimeType = input.key ? this.imageResolver.inferMimeType(input.key) : 'image/jpeg';
        return { inlineData: { mimeType, data: base64Data } };
    }
}
