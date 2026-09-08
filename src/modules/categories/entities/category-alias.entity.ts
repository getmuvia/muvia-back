import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Category } from './category.entity';

@Entity('category_aliases')
@Unique('UQ_category_aliases_locale_normalized', ['locale', 'normalizedAlias'])
@Index('IDX_category_aliases_locale', ['locale'])
export class CategoryAlias {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'category_id' })
  categoryId: string;

  @Column({ length: 35 })
  locale: string;

  @Column()
  alias: string;

  @Column({ name: 'normalized_alias' })
  normalizedAlias: string;

  @ManyToOne(() => Category, (category) => category.aliases, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'category_id' })
  category: Category;
}
