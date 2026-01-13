import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { STORAGE_PROVIDER } from './interfaces/storage-provider.interface';
import { LocalStorageProvider } from './providers/local-storage.provider';

@Module({
    imports: [ConfigModule],
    controllers: [FilesController],
    providers: [
        FilesService,
        {
            provide: STORAGE_PROVIDER,
            useClass: LocalStorageProvider,
        },
    ],
    exports: [FilesService],
})
export class FilesModule { }
