import { Controller, Post, Body } from '@nestjs/common';
import { SearchService } from '../services/search/search.service';
import { SearchQueryDto } from '../dto/search-query.dto';
import { HybridSearchDto } from '../dto/hybrid-search.dto';
import { SearchResult, HybridSearchResponse } from '../interfaces/search-result.interface';

/**
 * Handles search HTTP requests.
 * Public endpoint - no authentication required.
 */
@Controller('ai')
export class SearchController {
    constructor(private readonly searchService: SearchService) { }

    /**
     * Performs batch semantic search on products.
     * @example POST /ai/search { "queries": ["sofa nordico"], "limit": 5 }
     */
    @Post('search')
    search(@Body() dto: SearchQueryDto): Promise<SearchResult[]> {
        return this.searchService.searchBatch(dto);
    }

    /**
     * Performs hybrid search combining semantic (AI) and lexical (text) search.
     * @example POST /ai/hybrid { "query": "sofa moderno", "limit": 10 }
     */
    @Post('hybrid')
    searchHybrid(@Body() dto: HybridSearchDto): Promise<HybridSearchResponse> {
        return this.searchService.searchHybrid(dto);
    }
}
