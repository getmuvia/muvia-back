import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';
import { Category } from './entities/category.entity';
import { CategoryAlias } from './entities/category-alias.entity';
import { CategoryRelation } from './entities/category-relation.entity';
import { CategoryTranslation } from './entities/category-translation.entity';
import { CategoryTaxonomyService } from './category-taxonomy.service';

@Module({
  imports: [TypeOrmModule.forFeature([
    Category,
    CategoryAlias,
    CategoryRelation,
    CategoryTranslation,
  ])],
  controllers: [CategoriesController],
  providers: [CategoriesService, CategoryTaxonomyService],
  exports: [CategoriesService, CategoryTaxonomyService],
})
export class CategoriesModule { }
