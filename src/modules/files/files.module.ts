import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductAsset } from '../products/entities/product-asset.entity';
import { VendorProfile } from '../users/entities/vendor-profile.entity';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { STORAGE_PROVIDER } from './interfaces/storage-provider.interface';
import { GoogleCloudStorageProvider } from './providers/google-storage.provider';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([ProductAsset, VendorProfile]),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 30 }],
      getTracker: (request) => {
        const user = request.user as { id?: string } | undefined;
        return user?.id ?? String(request.ip);
      },
    }),
  ],
  controllers: [FilesController],
  providers: [
    FilesService,
    {
      provide: STORAGE_PROVIDER,
      useClass: GoogleCloudStorageProvider,
    },
  ],
  exports: [FilesService],
})
export class FilesModule {}
