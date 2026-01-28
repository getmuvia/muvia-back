import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../products/entities/product.entity';
import { ProductsModule } from '../products/products.module';

// Repository
import { ProductVectorRepository } from './repositories/product-vector.repository';

// Services
import { VectorService } from './services/vector/vector.service';
import { EmbeddingService } from './services/embedding/embedding.service';
import { SearchService } from './services/search/search.service';
import { VirtualStagingService } from './services/virtual-staging/virtual-staging.service';

// Controllers
import { SearchController } from './controllers/search.controller';
import { EmbeddingController } from './controllers/embedding.controller';
import { VirtualStagingController } from './controllers/virtual-staging.controller';

// Ports (Interfaces)
import { VISION_PROVIDER } from './interfaces/vision-provider.interface';
import { IMAGE_GENERATOR } from './interfaces/image-generator.interface';

import { GeminiVisionProvider } from './providers/google/gemini-vision.provider';
import { ImagenProvider } from './providers/google/imagen.provider';

/**
 * AI Module - Semantic search, embeddings, and virtual staging.
 *
 * Architecture:
 * - Ports & Adapters pattern for AI providers (Vision, Image Generation)
 * - VectorService: Vertex AI embeddings
 * - ProductVectorRepository: pgvector queries
 * - EmbeddingService: Embedding orchestration
 * - SearchService: Hybrid search orchestration
 * - VirtualStagingService: Room staging orchestration (provider-agnostic)
 *
 * To change AI providers, modify the useClass in the providers array.
 */
@Module({
    imports: [
        TypeOrmModule.forFeature([Product]),
        forwardRef(() => ProductsModule),
    ],

    controllers: [
        SearchController,
        EmbeddingController,
        VirtualStagingController,
    ],

    providers: [
        ProductVectorRepository,
        VectorService,
        EmbeddingService,
        SearchService,

        {
            provide: VISION_PROVIDER,
            useClass: GeminiVisionProvider,
        },
        {
            provide: IMAGE_GENERATOR,
            useClass: ImagenProvider,
        },
        VirtualStagingService,
    ],

    exports: [EmbeddingService],
})
export class AiModule { }
