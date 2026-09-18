import { Type, type Schema } from '@google/genai';

const ROOM_ANALYSIS_OUTPUT_SCHEMA = {
    type: Type.OBJECT,
    required: [
        'roomType',
        'style',
        'emptyAreas',
        'suggestedFurniture',
        'colorPalette',
    ],
    properties: {
        roomType: { type: Type.STRING },
        style: { type: Type.STRING },
        emptyAreas: { type: Type.ARRAY, items: { type: Type.STRING } },
        suggestedFurniture: { type: Type.ARRAY, items: { type: Type.STRING } },
        colorPalette: { type: Type.ARRAY, items: { type: Type.STRING } },
        dimensions: {
            type: Type.OBJECT,
            required: ['width', 'depth'],
            properties: {
                width: {
                    type: Type.STRING,
                    format: 'enum',
                    enum: ['small', 'medium', 'large'],
                },
                depth: {
                    type: Type.STRING,
                    format: 'enum',
                    enum: ['compact', 'spacious'],
                },
            },
        },
    },
} satisfies Schema;

/**
 * Room Analysis Prompt Template
 * Used by vision providers to analyze room images for virtual staging.
 *
 * @version 1.1.0
 * @provider GeminiVision, OpenAI Vision (compatible)
 */
export const ROOM_ANALYSIS_PROMPT = {
    version: '1.1.0',

    /**
     * Main prompt template for room analysis.
     * Expects the AI to return structured JSON with room details.
     */
    template: `Analyze this room image for virtual furniture staging.
        
Identify and return a JSON object with:
- roomType: The type of room (living room, bedroom, dining room, office, kitchen, bathroom, etc.)
- style: The current or suggested design style (modern, minimalist, rustic, industrial, scandinavian, bohemian, traditional, contemporary)
- emptyAreas: Array of areas where furniture could be placed (e.g., "center", "left corner", "near window", "against wall")
- suggestedFurniture: Array of furniture pieces that would fit well (be specific: "3-seater sofa", "round coffee table", "floor lamp", etc.)
- colorPalette: Array of colors that match the room (e.g., "beige", "warm gray", "oak wood", "navy blue")

Return ONLY valid JSON, no markdown or explanations.`,

    /**
     * Expected output schema for validation.
     */
    outputSchema: ROOM_ANALYSIS_OUTPUT_SCHEMA,

    /**
     * Recommended generation config for this prompt.
     */
    generationConfig: {
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
    },
} as const;

export type RoomAnalysisPromptConfig = typeof ROOM_ANALYSIS_PROMPT;
