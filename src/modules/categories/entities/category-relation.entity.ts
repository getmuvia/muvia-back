import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Category } from './category.entity';

@Entity('category_relations')
export class CategoryRelation {
  @PrimaryColumn({ name: 'source_category_id', type: 'uuid' })
  sourceCategoryId: string;

  @PrimaryColumn({ name: 'target_category_id', type: 'uuid' })
  targetCategoryId: string;

  @Column({ default: 'related' })
  kind: string;

  @ManyToOne(() => Category, (category) => category.outgoingRelations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'source_category_id' })
  sourceCategory: Category;

  @ManyToOne(() => Category, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'target_category_id' })
  targetCategory: Category;
}
