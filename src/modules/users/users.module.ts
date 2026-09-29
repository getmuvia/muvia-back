import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { VendorProfile } from './entities/vendor-profile.entity';
import { VendorLocation } from './entities/vendor-location.entity';
import { MarketsModule } from '../markets/markets.module';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, VendorProfile, VendorLocation]),
    MarketsModule,
    FilesModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
