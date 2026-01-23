import { Controller, Post, Body } from '@nestjs/common';
import { SearchService } from '../services/search/search.service';
import { SearchQueryDto } from '../dto/search-query.dto';
import { SearchResult } from '../interfaces/search-result.interface';

/**
 * Handles semantic search HTTP requests.
 * Public endpoint - no authentication required.
 */
@Controller('ai')
export class SearchController {
    constructor(private readonly searchService: SearchService) { }

    /**
     * Performs batch semantic search on products.
     * @example POST /ai/search { "queries": ["sofá nórdico"], "limit": 5 }
     */
    @Post('search')
    search(@Body() dto: SearchQueryDto): Promise<SearchResult[]> {
        return this.searchService.searchBatch(dto);
    }
}
