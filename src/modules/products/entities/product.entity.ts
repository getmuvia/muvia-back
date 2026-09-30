import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Category } from '../../categories/entities/category.entity';
import { ProductAsset } from './product-asset.entity';
import { ProductListing } from './product-listing.entity';

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

  @Column('text', { nullable: true })
  description: string;

  @Column('decimal', { precision: 10, scale: 2 })
  price: number;

  @Column({ default: 0 })
  stock: number;

  @Column({ type: 'jsonb', nullable: true })
  specifications: ProductSpecifications;

  @Column('text', { array: true, default: '{}' })
  keywords: string[];

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
