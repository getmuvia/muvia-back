import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ProductsModule } from './modules/products/products.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { FilesController } from './modules/files/files.controller';
import { FilesService } from './modules/files/files.service';

@Module({
  imports: [AuthModule, UsersModule, ProductsModule, CategoriesModule],
  controllers: [AppController, FilesController],
  providers: [AppService, FilesService],
})
export class AppModule {}
