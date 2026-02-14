import {
    IsArray,
    IsString,
    ArrayMinSize,
    ArrayMaxSize,
    IsOptional,
    IsNumber,
    Min,
    Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { VALIDATION } from '../constants';

/**
 * Request DTO for batch semantic search.
 *
 * Allows searching for multiple queries in parallel, with each query
 * being converted to a vector embedding and matched against products.
 *
 * @example
 * {
 *   "queries": ["gray nordic sofa", "glass coffee table"],
 *   "limit": 5,
 *   "threshold": 0.5
 * }
 */
export class SearchQueryDto {
    /**
     * Natural language queries to search for.
     * Each query is converted to an embedding and matched against product vectors.
     *
    * @example ["gray nordic sofa", "glass coffee table"]
     * @minItems 1
     * @maxItems 10
     */
    @IsArray()
    @IsString({ each: true })
    @ArrayMinSize(1)
    @ArrayMaxSize(VALIDATION.MAX_BATCH_QUERIES)
    queries: string[];

    /**
     * Maximum results to return per query.
     *
     * @default 5
     * @minimum 1
     * @maximum 50
     */
    @IsNumber()
    @Min(1)
    @Max(VALIDATION.MAX_RESULTS_PER_QUERY)
    @IsOptional()
    @Type(() => Number)
    limit?: number = 5;

    /**
     * Minimum similarity threshold (0.0 - 1.0).
     * Higher values return more relevant but fewer results.
     *
     * @default 0.5
     * @minimum 0
     * @maximum 1
     */
    @IsNumber()
    @Min(0)
    @Max(1)
    @IsOptional()
    @Type(() => Number)
    threshold?: number = 0.5;
}
