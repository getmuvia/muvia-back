import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VertexAI, GenerativeModel, Part } from '@google-cloud/vertexai';
import {
    IVisionProvider,
    RoomAnalysisResult,
    ImageSourceInput,
} from '../../interfaces/vision-provider.interface';

/**
 * Google Gemini Vision implementation of IVisionProvider.
 * Uses Vertex AI Gemini models for room image analysis.
 * 
 * Image resolution strategy:
 * - key provided → Uses gs:// reference (zero backend memory, fastest)
 * - url provided → Downloads to buffer, sends as base64
 */
@Injectable()
export class GeminiVisionProvider implements IVisionProvider {
    private readonly logger = new Logger(GeminiVisionProvider.name);
    private readonly vertexAI: VertexAI;
    private readonly model: GenerativeModel;
    private readonly bucketName: string;

    private readonly MODEL_NAME = 'gemini-1.5-flash';

    constructor(private readonly configService: ConfigService) {
        const projectId = this.configService.get<string>('GCP_PROJECT_ID');
        const location = this.configService.get<string>('GCP_LOCATION', 'us-central1');
        this.bucketName = this.configService.get<string>('GOOGLE_STORAGE_BUCKET') ?? '';

        if (!projectId) {
            this.logger.error('GCP_PROJECT_ID not configured');
            throw new Error('GCP_PROJECT_ID is required for GeminiVisionProvider');
        }

        this.vertexAI = new VertexAI({ project: projectId, location });
        this.model = this.vertexAI.getGenerativeModel({ model: this.MODEL_NAME });

        this.logger.log(`✅ GeminiVisionProvider initialized (${this.MODEL_NAME})`);
    }

    async analyzeRoom(input: ImageSourceInput): Promise<RoomAnalysisResult> {
        if (!input.key && !input.url) {
            throw new BadRequestException('Either imageKey or imageUrl must be provided');
        }

        const imagePart = await this.resolveImagePart(input);
        const prompt = this.buildAnalysisPrompt();

        this.logger.debug(`Analyzing room image via ${input.key ? 'gs://' : 'URL download'}...`);

        const response = await this.model.generateContent({
            contents: [
                {
                    role: 'user',
                    parts: [imagePart, { text: prompt }],
                },
            ],
            generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 1024,
                responseMimeType: 'application/json',
            },
        });

        const result = response.response;
        const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            throw new Error('No response from Gemini Vision');
        }

        return this.parseResponse(text);
    }

    /**
     * Resolves image input to a Gemini-compatible Part.
     * Priority: key (gs://) > url (download)
     */
    private async resolveImagePart(input: ImageSourceInput): Promise<Part> {

        if (input.key) {
            const gsUri = `gs://${this.bucketName}/${input.key}`;
            const mimeType = this.inferMimeType(input.key);
            
            this.logger.debug(`Using native GCS reference: ${gsUri}`);
            
            return {
                fileData: {
                    fileUri: gsUri,
                    mimeType,
                },
            };
        }

        if (input.url) {
            this.logger.debug(`Downloading external image: ${input.url}`);
            
            const { buffer, mimeType } = await this.downloadImage(input.url);
            
            return {
                inlineData: {
                    mimeType,
                    data: buffer.toString('base64'),
                },
            };
        }

        throw new BadRequestException('No valid image source provided');
    }

    /**
     * Downloads an image from external URL.
     */
    private async downloadImage(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
        try {
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type') || 'image/jpeg';
            const arrayBuffer = await response.arrayBuffer();
            
            return {
                buffer: Buffer.from(arrayBuffer),
                mimeType: contentType.split(';')[0],
            };
        } catch (error) {
            this.logger.error(`Failed to download image from ${url}: ${error.message}`);
            throw new BadRequestException(`Cannot download image: ${error.message}`);
        }
    }

    /**
     * Infers MIME type from file extension.
     */
    private inferMimeType(key: string): string {
        const ext = key.split('.').pop()?.toLowerCase();
        const mimeTypes: Record<string, string> = {
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            png: 'image/png',
            webp: 'image/webp',
            gif: 'image/gif',
        };
        return mimeTypes[ext || ''] || 'image/jpeg';
    }

    private buildAnalysisPrompt(): string {
        return `Analyze this room image for virtual furniture staging. 
        
Identify and return a JSON object with:
- roomType: The type of room (living room, bedroom, dining room, office, kitchen, bathroom, etc.)
- style: The current or suggested design style (modern, minimalist, rustic, industrial, scandinavian, bohemian, traditional, contemporary)
- emptyAreas: Array of areas where furniture could be placed (e.g., "center", "left corner", "near window", "against wall")
- suggestedFurniture: Array of furniture pieces that would fit well (be specific: "3-seater sofa", "round coffee table", "floor lamp", etc.)
- colorPalette: Array of colors that match the room (e.g., "beige", "warm gray", "oak wood", "navy blue")

Return ONLY valid JSON, no markdown or explanations.`;
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
            this.logger.error(`Failed to parse Gemini response: ${text}`);
            throw new Error('Invalid response format from vision model');
        }
    }
}
