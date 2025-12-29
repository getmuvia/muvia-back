import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Category } from './entities/category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
  ) { }

  async create(createCategoryDto: CreateCategoryDto): Promise<Category> {
    const level = await this.calculateLevel(createCategoryDto.parentId);

    const category = this.categoryRepository.create({
      ...createCategoryDto,
      level,
    });

    return this.categoryRepository.save(category);
  }

  async findAll(): Promise<Category[]> {
    return this.categoryRepository.find({
      relations: ['subcategories'],
      order: { level: 'ASC', name: 'ASC' },
    });
  }

  async findRootCategories(): Promise<Category[]> {
    return this.categoryRepository.find({
      where: { parentId: IsNull() },
      relations: ['subcategories'],
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Category> {
    const category = await this.categoryRepository.findOne({
      where: { id },
      relations: ['subcategories', 'parent'],
    });

    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    return category;
  }

  async findWithSubcategories(id: string): Promise<Category> {
    const category = await this.findOne(id);
    return this.loadSubcategoriesRecursively(category);
  }

  async findByLevel(level: number): Promise<Category[]> {
    return this.categoryRepository.find({
      where: { level },
      relations: ['subcategories'],
      order: { name: 'ASC' },
    });
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto): Promise<Category> {
    const category = await this.findOne(id);

    if (updateCategoryDto.parentId !== undefined) {
      await this.validateParentChange(id, updateCategoryDto.parentId);
      category.level = await this.calculateLevel(updateCategoryDto.parentId);
    }

    Object.assign(category, updateCategoryDto);
    await this.categoryRepository.save(category);

    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const category = await this.findOne(id);
    await this.categoryRepository.remove(category);
  }

  private async calculateLevel(parentId: string | undefined | null): Promise<number> {
    if (!parentId) {
      return 0;
    }

    const parent = await this.categoryRepository.findOne({
      where: { id: parentId },
    });

    if (!parent) {
      throw new NotFoundException(`Parent category with ID ${parentId} not found`);
    }

    return parent.level + 1;
  }

  private async validateParentChange(categoryId: string, newParentId: string | null): Promise<void> {
    if (!newParentId) {
      return;
    }

    if (categoryId === newParentId) {
      throw new BadRequestException('A category cannot be its own parent');
    }

    const descendants = await this.getDescendantIds(categoryId);
    if (descendants.includes(newParentId)) {
      throw new BadRequestException('Cannot set a descendant as parent (circular reference)');
    }
  }

  private async getDescendantIds(categoryId: string): Promise<string[]> {
    const category = await this.categoryRepository.findOne({
      where: { id: categoryId },
      relations: ['subcategories'],
    });

    if (!category || !category.subcategories.length) {
      return [];
    }

    const descendantIds: string[] = [];
    for (const subcategory of category.subcategories) {
      descendantIds.push(subcategory.id);
      const subDescendants = await this.getDescendantIds(subcategory.id);
      descendantIds.push(...subDescendants);
    }

    return descendantIds;
  }

  private async loadSubcategoriesRecursively(category: Category): Promise<Category> {
    if (!category.subcategories || category.subcategories.length === 0) {
      return category;
    }

    for (let i = 0; i < category.subcategories.length; i++) {
      const fullSubcategory = await this.categoryRepository.findOne({
        where: { id: category.subcategories[i].id },
        relations: ['subcategories'],
      });
      if (fullSubcategory) {
        category.subcategories[i] = await this.loadSubcategoriesRecursively(fullSubcategory);
      }
    }

    return category;
  }
}
