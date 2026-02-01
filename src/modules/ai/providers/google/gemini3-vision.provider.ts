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

@Injectable()
export class Gemini3VisionProvider implements IVisionProvider {
    private readonly logger = new Logger(Gemini3VisionProvider.name);
    private readonly ai: GoogleGenAI;
    private readonly MODEL_NAME: string;

    constructor(
        private readonly configService: ConfigService,
        private readonly retryService: RetryService,
        private readonly imageResolver: ImageResolverService,
    ) {
        const projectId = this.configService.get<string>('GCP_PROJECT_ID');
        const location = this.configService.get<string>('GCP_LOCATION', 'global');
        this.MODEL_NAME = this.configService.get<string>('GCP_GEMINI_MODEL', 'gemini-3-pro-preview');

        if (!projectId) {
            this.logger.error('GCP_PROJECT_ID not configured');
            throw new Error('GCP_PROJECT_ID is required for Gemini3VisionProvider');
        }

        this.ai = new GoogleGenAI({
            vertexai: true,
            project: projectId,
            location: location,
        });

        this.logger.log(`✅ Gemini3VisionProvider initialized (${this.MODEL_NAME} @ ${location})`);
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
                        temperature: ROOM_ANALYSIS_PROMPT.generationConfig.temperature,
                        maxOutputTokens: ROOM_ANALYSIS_PROMPT.generationConfig.maxOutputTokens,
                        responseMimeType: 'application/json',
                    },
                }),
                {
                    operationName: `Gemini 3 Vision (${this.MODEL_NAME})`,
                    isRetryable: (err) => this.retryService.isQuotaExceededError(err),
                    initialDelayMs: 2000,
                },
            );

            if (!response.text) throw new Error('No response from Gemini 3 Vision');
            return this.parseResponse(response.text);
        } catch (error) {
            this.logger.error(`Room analysis failed: ${error.message}`);
            throw error;
        }
    }

    private async buildImagePart(input: ImageSourceInput): Promise<any> {
        const base64Data = await this.imageResolver.toBase64(input);
        const mimeType = input.key ? this.imageResolver.inferMimeType(input.key) : 'image/jpeg';
        return { inlineData: { mimeType, data: base64Data } };
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
