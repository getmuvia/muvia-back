import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Market } from './entities/market.entity';
import { MarketsController } from './markets.controller';
import { MarketsService } from './markets.service';

@Module({
  imports: [TypeOrmModule.forFeature([Market])],
  controllers: [MarketsController],
  providers: [MarketsService],
  exports: [MarketsService, TypeOrmModule],
})
export class MarketsModule {}
