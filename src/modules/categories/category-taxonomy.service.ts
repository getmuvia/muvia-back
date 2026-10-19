import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './entities/category.entity';

export interface SearchCategory {
  code: string;
  label: string;
  aliases: string[];
}

/** Supplies catalog vocabulary without interpreting the buyer's sentence. */
@Injectable()
export class CategoryTaxonomyService {
  private catalog?: Promise<Category[]>;
  private expiresAt = 0;

  constructor(
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
  ) {}

  async getSearchCategories(locale: string): Promise<SearchCategory[]> {
    if (!this.catalog || this.expiresAt <= Date.now()) {
      this.expiresAt = Date.now() + 300_000;
      this.catalog = this.categories
        .find({
          where: { isSelectable: true },
          relations: { aliases: true, translations: true },
          order: { code: 'ASC' },
        })
        .catch((error) => {
          this.catalog = undefined;
          throw error;
        });
    }
    const categories = await this.catalog;
    const language = locale.split('-')[0];
    const data = categories.map((category) => ({
      code: category.code,
      label:
        category.translations.find((item) => item.locale === locale)?.name ??
        category.translations.find((item) => item.locale === language)?.name ??
        category.name,
      aliases: category.aliases
        .filter((item) => [locale, language, 'en'].includes(item.locale))
        .map((item) => item.alias),
    }));
    return data;
  }
}
