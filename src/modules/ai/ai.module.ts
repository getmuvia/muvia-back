import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../products/entities/product.entity';
import { ProductsModule } from '../products/products.module';

// Core utilities
import { RetryService } from './core/retry';
import { ImageResolverService } from './core/image';

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
import { SCAN_3D_PROVIDER } from './interfaces/scan-3d-provider.interface';

import { ImagenProvider } from './providers/google/imagen.provider';
import { Vertex3DProvider } from './providers/google/vertex-3d.provider';
import { Scan3dService } from './services/scan-3d/scan-3d.service';
import { Scan3dController } from './controllers/scan-3d.controller';
import { Gemini3VisionProvider } from './providers/google';

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
        Scan3dController
    ],

    providers: [
        // Core utilities (shared across providers)
        RetryService,
        ImageResolverService,

        // Repository
        ProductVectorRepository,

        // Services
        VectorService,
        EmbeddingService,
        SearchService,
        Scan3dService,

        // AI Providers (Ports & Adapters)
        {
            provide: VISION_PROVIDER,
            useClass: Gemini3VisionProvider,
        },
        {
            provide: IMAGE_GENERATOR,
            useClass: ImagenProvider,
        },
        {
            provide: SCAN_3D_PROVIDER,
            useClass: Vertex3DProvider,
        },

        // Orchestrators
        VirtualStagingService,
    ],

    exports: [EmbeddingService],
})
export class AiModule { }
