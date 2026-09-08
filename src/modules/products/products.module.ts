import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { Product } from './entities/product.entity';
import { ProductAsset } from './entities/product-asset.entity';
import { AiModule } from '../ai/ai.module';
import { ProductListing } from './entities/product-listing.entity';
import { VendorLocation } from '../users/entities/vendor-location.entity';
import { Category } from '../categories/entities/category.entity';
import { MarketsModule } from '../markets/markets.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, ProductAsset, ProductListing, VendorLocation, Category]),
    AiModule,
    MarketsModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule { }
