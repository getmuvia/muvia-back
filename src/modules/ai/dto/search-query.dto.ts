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

/**
 * DTO for semantic search requests.
 * Validates batch queries with configurable result limits.
 */
export class SearchQueryDto {
    /**
     * Natural language queries to search for.
     * Each query is converted to an embedding and matched against products.
     * @example ["sofá nórdico gris", "mesa de centro vidrio"]
     */
    @IsArray()
    @IsString({ each: true })
    @ArrayMinSize(1)
    @ArrayMaxSize(10)
    queries: string[];

    /**
     * Maximum results per query.
     * @default 5
     */
    @IsNumber()
    @Min(1)
    @Max(50)
    @IsOptional()
    @Type(() => Number)
    limit?: number = 5;

    /**
     * Minimum similarity threshold (0-1).
     * Higher values return more relevant but fewer results.
     * @default 0.5
     */
    @IsNumber()
    @Min(0)
    @Max(1)
    @IsOptional()
    @Type(() => Number)
    threshold?: number = 0.5;
}
