import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Product } from './product.entity';
import { VendorLocation } from '../../users/entities/vendor-location.entity';
import { Market } from '../../markets/entities/market.entity';

@Entity('product_listings')
@Unique('UQ_product_listings_product_market', ['productId', 'marketCode'])
export class ProductListing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'product_id' })
  productId: string;

  @Column({ name: 'vendor_location_id' })
  vendorLocationId: string;

  @Column({ name: 'market_code', type: 'char', length: 2 })
  marketCode: string;

  @Column('decimal', { precision: 10, scale: 2 })
  price: number;

  @Column({ name: 'currency_code', type: 'char', length: 3 })
  currencyCode: string;

  @Column({ default: 0 })
  stock: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @ManyToOne(() => Product, (product) => product.listings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @ManyToOne(() => VendorLocation, (location) => location.listings, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'vendor_location_id' })
  vendorLocation: VendorLocation;

  @ManyToOne(() => Market, (market) => market.listings, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'market_code' })
  market: Market;
}
