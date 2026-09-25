import { Body, Controller, Header, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { HybridSearchDto } from './dto/hybrid-search.dto';
import { SearchQueryDto } from './dto/search-query.dto';
import type { HybridSearchResponseDto } from './dto/search-response.dto';
import type { SearchResult } from './interfaces/search-result.interface';
import { SearchService } from './services/search.service';

@Controller('ai')
@UseGuards(ThrottlerGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Post('search')
  @Header('Cache-Control', 'no-store')
  search(@Body() dto: SearchQueryDto): Promise<SearchResult[]> {
    return this.searchService.searchBatch(dto);
  }

  @Post('hybrid')
  @Header('Cache-Control', 'no-store')
  searchHybrid(@Body() dto: HybridSearchDto): Promise<HybridSearchResponseDto> {
    return this.searchService.searchHybrid(dto);
  }
}
