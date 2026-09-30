import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity';

export type EmbeddingJobStatus =
  | 'pending'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'superseded'
  | 'failed';

@Entity('product_embedding_jobs')
@Check(
  'CHK_embedding_jobs_status',
  "status IN ('pending', 'queued', 'processing', 'completed', 'superseded', 'failed')",
)
@Index('IDX_embedding_jobs_product', ['productId'])
@Index('IDX_embedding_jobs_dispatch', ['nextDispatchAt'], {
  where: "status IN ('pending', 'queued', 'processing')",
})
@Index('IDX_embedding_jobs_cleanup', ['updatedAt'], {
  where: "status IN ('completed', 'superseded')",
})
export class ProductEmbeddingJob {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @Column('integer')
  revision: number;

  @Column({ type: 'varchar', length: 100 })
  model: string;

  @Column({ name: 'content_version', type: 'smallint' })
  contentVersion: number;

  @Column('text')
  document: string;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: EmbeddingJobStatus;

  @Column({ type: 'integer', default: 0 })
  attempts: number;

  @Column({ name: 'dispatch_version', type: 'integer', default: 0 })
  dispatchVersion: number;

  @Column({ name: 'lease_token', type: 'uuid', nullable: true })
  leaseToken: string | null;

  @Column({ name: 'lease_expires_at', type: 'timestamptz', nullable: true })
  leaseExpiresAt: Date | null;

  @Column({
    name: 'next_dispatch_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  nextDispatchAt: Date;

  @Column({ name: 'last_error', type: 'varchar', length: 500, nullable: true })
  lastError: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;
}
