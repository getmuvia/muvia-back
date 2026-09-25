import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai/ai.module';
import { CategoriesModule } from '../categories/categories.module';
import { MarketsModule } from '../markets/markets.module';
import { Product } from '../products/entities/product.entity';
import { SEARCH_INTENT_PROVIDER } from './interfaces/search-intent-provider.interface';
import { GeminiSearchIntentProvider } from './providers/google/gemini-search-intent.provider';
import { ProductLexicalRepository } from './repositories/product-lexical.repository';
import { ProductVectorRepository } from './repositories/product-vector.repository';
import { SearchController } from './search.controller';
import { SEARCH } from './search.constants';
import { SearchIntentService } from './services/search-intent.service';
import { SearchRankingService } from './services/search-ranking.service';
import { SearchService } from './services/search.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product]),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: SEARCH.RATE_LIMIT_PER_MINUTE,
        blockDuration: 60_000,
      },
    ]),
    AiModule,
    CategoriesModule,
    MarketsModule,
  ],
  controllers: [SearchController],
  providers: [
    SearchService,
    SearchIntentService,
    SearchRankingService,
    ProductLexicalRepository,
    ProductVectorRepository,
    {
      provide: SEARCH_INTENT_PROVIDER,
      useClass: GeminiSearchIntentProvider,
    },
  ],
})
export class SearchModule {}
