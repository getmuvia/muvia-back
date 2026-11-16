import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
  Check,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Category } from '../../categories/entities/category.entity';
import { ProductAsset } from './product-asset.entity';
import { ProductListing } from './product-listing.entity';
import { ProductCondition } from '../enums/product-condition.enum';
import { normalizedSearchSql } from '../../../common/search/search-text';
import { ProductAvailabilityMode } from '../enums/product-availability.enum';

export interface ProductSpecifications {
  weight?: string;
  dimensions?: {
    width: number;
    height: number;
    depth: number;
    unit: string;
  };
  material?: string;
  color?: string;
  [key: string]: unknown;
}

@Entity('products')
@Check(
  'CHK_product_availability',
  `
  (availability_mode = 'IN_STOCK' AND lead_time_min_days IS NULL AND lead_time_max_days IS NULL)
  OR (availability_mode = 'MADE_TO_ORDER'
    AND lead_time_min_days IS NOT NULL AND lead_time_max_days IS NOT NULL
    AND lead_time_min_days > 0 AND lead_time_max_days >= lead_time_min_days)
`,
)
@Index('IDX_products_search_title_trgm', { synchronize: false })
@Index('IDX_products_search_description_trgm', { synchronize: false })
@Index('IDX_products_search_keywords_trgm', { synchronize: false })
@Index('IDX_products_search_material_trgm', { synchronize: false })
@Index('IDX_products_pending_embedding', ['id'], {
  where: 'embedding_revision IS DISTINCT FROM search_revision',
})
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'seller_id' })
  sellerId: string;

  @Column({ name: 'category_id', nullable: true })
  categoryId: string;

  @Column()
  title: string;

  @Column({
    type: 'enum',
    enum: ProductCondition,
    enumName: 'product_condition_enum',
    default: ProductCondition.NEW,
  })
  condition: ProductCondition;

  @Column('text', { nullable: true })
  description: string;

  @Column('decimal', { precision: 10, scale: 2 })
  price: number;

  @Column({ default: 0 })
  stock: number;

  @Column({
    name: 'availability_mode',
    type: 'varchar',
    length: 20,
    default: ProductAvailabilityMode.IN_STOCK,
  })
  availabilityMode: ProductAvailabilityMode;

  @Column({ name: 'lead_time_min_days', type: 'integer', nullable: true })
  leadTimeMinDays: number | null;

  @Column({ name: 'lead_time_max_days', type: 'integer', nullable: true })
  leadTimeMaxDays: number | null;

  @Column({ name: 'accepts_custom_dimensions', default: false })
  acceptsCustomDimensions: boolean;

  @Column({ type: 'jsonb', nullable: true })
  specifications: ProductSpecifications;

  @Column('text', { array: true, default: '{}' })
  keywords: string[];

  // Space padding preserves lexical word boundaries and catalog substrings.
  // These columns are maintained by PostgreSQL, including direct SQL writes.
  @Column({
    type: 'text',
    name: 'search_title',
    asExpression: `(' ' || ${normalizedSearchSql('title')} || ' ')`,
    generatedType: 'STORED',
    select: false,
    insert: false,
    update: false,
  })
  readonly searchTitle: string;

  @Column({
    type: 'text',
    name: 'search_description',
    asExpression: `(' ' || ${normalizedSearchSql('description')} || ' ')`,
    generatedType: 'STORED',
    select: false,
    insert: false,
    update: false,
  })
  readonly searchDescription: string;

  @Column({
    type: 'text',
    name: 'search_keywords',
    asExpression: `(' ' || ${normalizedSearchSql('muvia_join_search_keywords(keywords)')} || ' ')`,
    generatedType: 'STORED',
    select: false,
    insert: false,
    update: false,
  })
  readonly searchKeywords: string;

  @Column({
    type: 'text',
    name: 'search_material',
    asExpression: `(' ' || ${normalizedSearchSql("specifications ->> 'material'")} || ' ')`,
    generatedType: 'STORED',
    select: false,
    insert: false,
    update: false,
  })
  readonly searchMaterial: string;

  /**
   * Normalized vector embedding for semantic search (768 dimensions).
   * Requires pgvector extension: CREATE EXTENSION IF NOT EXISTS vector;
   */
  @Column('vector', { length: 768, nullable: true, select: false })
  embedding: string;

  /** Model that generated the stored vector. Prevents mixing incompatible spaces. */
  @Column({
    name: 'embedding_model',
    type: 'varchar',
    length: 100,
    nullable: true,
    select: false,
  })
  embeddingModel: string;

  /** Version of the product fields included in the stored vector. */
  @Column({
    name: 'embedding_content_version',
    type: 'smallint',
    nullable: true,
    select: false,
  })
  embeddingContentVersion: number;

  @Column({
    name: 'search_revision',
    type: 'integer',
    default: 1,
    select: false,
  })
  searchRevision: number;

  @Column({
    name: 'embedding_revision',
    type: 'integer',
    nullable: true,
    select: false,
  })
  embeddingRevision: number | null;

  @Column({
    name: 'embedding_target_id',
    type: 'uuid',
    nullable: true,
    select: false,
  })
  embeddingTargetId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.products, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'seller_id' })
  seller: User;

  @ManyToOne(() => Category, (category) => category.products, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'category_id' })
  category: Category;

  @OneToMany(() => ProductAsset, (asset) => asset.product, { cascade: true })
  assets: ProductAsset[];

  @OneToMany(() => ProductListing, (listing) => listing.product, {
    cascade: true,
  })
  listings: ProductListing[];
}
