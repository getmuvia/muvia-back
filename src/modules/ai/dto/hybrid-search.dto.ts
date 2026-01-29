import {
    IsString,
    MinLength,
    IsOptional,
    IsNumber,
    Min,
    Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { VALIDATION, SEARCH } from '../constants';

/**
 * Request DTO for hybrid search.
 *
 * Combines semantic (AI vector) and lexical (text matching) search
 * for improved accuracy. Results are merged and ranked by combined score.
 *
 * @example
 * {
 *   "query": "sofa moderno gris",
 *   "limit": 10
 * }
 */
export class HybridSearchDto {
    /**
     * Search query text in natural language.
     * Will be used for both semantic embedding and lexical matching.
     *
     * @example "sofa moderno gris"
     * @minLength 2
     */
    @IsString()
    @MinLength(VALIDATION.MIN_QUERY_LENGTH)
    query: string;

    /**
     * Maximum results to return.
     * The actual search fetches more internally for better ranking.
     *
     * @default 10
     * @minimum 1
     * @maximum 50
     */
    @IsNumber()
    @Min(1)
    @Max(VALIDATION.MAX_RESULTS_PER_QUERY)
    @IsOptional()
    @Type(() => Number)
    limit?: number = SEARCH.DEFAULT_LIMIT;
}
