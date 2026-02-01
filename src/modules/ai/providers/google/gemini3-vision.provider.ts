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

/**
 * Gemini 3 Vision Provider using @google/genai SDK.
 * 
 * This provider uses the new unified Google Gen AI SDK which properly
 * supports the global endpoint required for Gemini 3 Preview models.
 * 
 * Key differences from GeminiVisionProvider:
 * - Uses @google/genai instead of @google-cloud/vertexai
 * - Properly handles 'global' location for preview models
 * - Uses ai.models.generateContent() API pattern
 * 
 * Environment variables (same as original):
 * - GCP_PROJECT_ID: Google Cloud project ID
 * - GCP_LOCATION: Location (use 'global' for Gemini 3 Preview)
 * - GCP_GEMINI_MODEL: Model ID (default: gemini-3-pro-preview)
 */
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

        // Initialize using @google/genai SDK with Vertex AI mode
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
        this.logger.debug(`Analyzing room image via ${input.key ? 'GCS key' : 'URL download'}...`);

        try {
            const response = await this.retryService.withExponentialBackoff(
                () => this.ai.models.generateContent({
                    model: this.MODEL_NAME,
                    contents: [
                        imagePart,
                        { text: ROOM_ANALYSIS_PROMPT.template },
                    ],
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

            const text = response.text;

            if (!text) {
                throw new Error('No response from Gemini 3 Vision');
            }

            return this.parseResponse(text);
        } catch (error) {
            this.logger.error(`Room analysis failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Builds an image part for the @google/genai SDK.
     * Uses inlineData with base64 encoding.
     */
    private async buildImagePart(input: ImageSourceInput): Promise<any> {
        const base64Data = await this.imageResolver.toBase64(input);
        const mimeType = input.key
            ? this.imageResolver.inferMimeType(input.key)
            : 'image/jpeg';

        return {
            inlineData: {
                mimeType,
                data: base64Data,
            },
        };
    }

    /**
     * Parses Gemini JSON response into RoomAnalysisResult.
     * With responseMimeType: 'application/json', we expect clean JSON.
     */
    private parseResponse(text: string): RoomAnalysisResult {
        try {
            // Even with JSON mode, sometimes markdown blocks might appear
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
            this.logger.error(`Failed to parse Gemini response: ${text}`);
            throw new Error('Invalid response format from vision model');
        }
    }
}
