/**
 * AI Prompts Module
 *
 * Centralized prompt templates for AI providers.
 * Separating prompts from business logic allows:
 * - Easy A/B testing of different prompt versions
 * - Version control and rollback of prompts
 * - Clear documentation of expected inputs/outputs
 * - Reuse across different providers
 */

// Room Analysis
export { ROOM_ANALYSIS_PROMPT, type RoomAnalysisPromptConfig } from './templates/room-analysis.prompt';

// Staging Generation
export {
    buildStagingPrompt,
    buildSimpleStagingPrompt,
    STAGING_GENERATION_CONFIG,
    type StagingPromptContext,
} from './templates/staging-generation.prompt';

// Generic Image Generation
export {
    buildImageGenerationPrompt,
    IMAGE_GENERATION_CONFIG,
} from './templates/image-generation.prompt';
