import {
    IsString,
    MinLength,
    IsOptional,
    IsNumber,
    Min,
    Max,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for hybrid search requests.
 * Combines semantic (AI) and lexical (text) search.
 */
export class HybridSearchDto {
    /**
     * Search query text.
     * @example "sofa moderno gris"
     */
    @IsString()
    @MinLength(2)
    query: string;

    /**
     * Maximum results to return.
     * @default 10
     */
    @IsNumber()
    @Min(1)
    @Max(50)
    @IsOptional()
    @Type(() => Number)
    limit?: number = 10;
}
