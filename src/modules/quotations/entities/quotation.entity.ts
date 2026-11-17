import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity';
import { User } from '../../users/entities/user.entity';
import {
  QuotationStatus,
  type QuotationDimensions,
} from '../quotation.constants';

@Entity('quotations')
@Unique('UQ_quotations_customer_request', ['customerId', 'requestId'])
@Index('IDX_quotations_customer_created', ['customerId', 'createdAt'])
@Index('IDX_quotations_seller_created', ['sellerId', 'createdAt'])
@Check('CHK_quotations_participants', 'customer_id <> seller_id')
@Check(
  'CHK_quotations_response',
  `(status = 'PENDING' AND responded_at IS NULL AND response_message IS NULL AND quoted_price IS NULL AND lead_time_min_days IS NULL AND lead_time_max_days IS NULL) OR (status = 'DECLINED' AND responded_at IS NOT NULL AND response_message IS NOT NULL AND length(btrim(response_message)) > 0 AND quoted_price IS NULL AND lead_time_min_days IS NULL AND lead_time_max_days IS NULL) OR (status = 'QUOTED' AND responded_at IS NOT NULL AND response_message IS NOT NULL AND length(btrim(response_message)) > 0 AND quoted_price IS NOT NULL AND quoted_price > 0 AND lead_time_min_days IS NOT NULL AND lead_time_max_days IS NOT NULL AND lead_time_min_days > 0 AND lead_time_max_days >= lead_time_min_days)`,
)
export class Quotation {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'request_id', type: 'uuid' }) requestId: string;
  @Column({ name: 'product_id', type: 'uuid', nullable: true }) productId:
    | string
    | null;
  @Column({ name: 'customer_id', type: 'uuid' }) customerId: string;
  @Column({ name: 'seller_id', type: 'uuid' }) sellerId: string;
  @Column({ name: 'customer_email' }) customerEmail: string;
  @Column({ name: 'seller_name', nullable: true, type: 'varchar' }) sellerName:
    | string
    | null;
  @Column({ name: 'product_title' }) productTitle: string;
  @Column({ name: 'product_image_url', type: 'text', nullable: true })
  productImageUrl: string | null;
  @Column({ name: 'market_code', type: 'char', length: 2 }) marketCode: string;
  @Column({ name: 'currency_code', type: 'char', length: 3 })
  currencyCode: string;
  @Column({ name: 'published_price', type: 'decimal', precision: 10, scale: 2 })
  publishedPrice: string;
  @Column({ name: 'published_dimensions', type: 'jsonb' })
  publishedDimensions: QuotationDimensions;
  @Column({ name: 'requested_dimensions', type: 'jsonb' })
  requestedDimensions: QuotationDimensions;
  @Column({ type: 'text', default: '' }) notes: string;
  @Column({ type: 'varchar', length: 20, default: QuotationStatus.PENDING })
  status: QuotationStatus;
  @Column({
    name: 'quoted_price',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  quotedPrice: string | null;
  @Column({ name: 'lead_time_min_days', type: 'integer', nullable: true })
  leadTimeMinDays: number | null;
  @Column({ name: 'lead_time_max_days', type: 'integer', nullable: true })
  leadTimeMaxDays: number | null;
  @Column({ name: 'response_message', type: 'text', nullable: true })
  responseMessage: string | null;
  @Column({ name: 'responded_at', type: 'timestamptz', nullable: true })
  respondedAt: Date | null;
  @Column({ name: 'seller_viewed_at', type: 'timestamptz', nullable: true })
  sellerViewedAt: Date | null;
  @Column({ name: 'customer_viewed_at', type: 'timestamptz', nullable: true })
  customerViewedAt: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Product, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'product_id' })
  product: Product | null;
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: User;
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'seller_id' })
  seller: User;
}
