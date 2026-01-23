import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../products/entities/product.entity';

// Repository
import { ProductVectorRepository } from './repositories/product-vector.repository';

// Services
import { VectorService } from './services/vector/vector.service';
import { EmbeddingService } from './services/embedding/embedding.service';
import { SearchService } from './services/search/search.service';

// Controllers
import { SearchController } from './controllers/search.controller';
import { EmbeddingController } from './controllers/embedding.controller';

/**
 * AI Module - Semantic search and embedding management.
 *
 * Architecture (SOLID):
 * - VectorService: Vertex AI client (Single Responsibility)
 * - ProductVectorRepository: pgvector queries (Single Responsibility)
 * - EmbeddingService: Embedding orchestration (Single Responsibility)
 * - SearchService: Search orchestration (Single Responsibility)
 */
@Module({
    imports: [TypeOrmModule.forFeature([Product])],
    controllers: [SearchController, EmbeddingController],
    providers: [
        ProductVectorRepository,
        VectorService,
        EmbeddingService,
        SearchService,
    ],
    exports: [EmbeddingService],
})
export class AiModule { }
