/**
 * Room Analysis Prompt Template
 * Used by vision providers to analyze room images for virtual staging.
 *
 * @version 1.0.0
 * @provider GeminiVision, OpenAI Vision (compatible)
 */
export const ROOM_ANALYSIS_PROMPT = {
    version: '1.0.0',

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
    outputSchema: {
        type: 'object',
        required: ['roomType', 'style', 'emptyAreas', 'suggestedFurniture', 'colorPalette'],
        properties: {
            roomType: { type: 'string' },
            style: { type: 'string' },
            emptyAreas: { type: 'array', items: { type: 'string' } },
            suggestedFurniture: { type: 'array', items: { type: 'string' } },
            colorPalette: { type: 'array', items: { type: 'string' } },
            dimensions: {
                type: 'object',
                properties: {
                    width: { enum: ['small', 'medium', 'large'] },
                    depth: { enum: ['compact', 'spacious'] },
                },
            },
        },
    },

    /**
     * Recommended generation config for this prompt.
     */
    generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
    },
} as const;

export type RoomAnalysisPromptConfig = typeof ROOM_ANALYSIS_PROMPT;
