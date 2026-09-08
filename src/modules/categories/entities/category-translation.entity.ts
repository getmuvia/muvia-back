import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Category } from './category.entity';

@Entity('category_translations')
@Unique('UQ_category_translations_category_locale', ['categoryId', 'locale'])
export class CategoryTranslation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'category_id' })
  categoryId: string;

  @Column({ length: 35 })
  locale: string;

  @Column()
  name: string;

  @ManyToOne(() => Category, (category) => category.translations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'category_id' })
  category: Category;
}
