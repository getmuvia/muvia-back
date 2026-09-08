import { Column, Entity, OneToMany, PrimaryColumn } from 'typeorm';
import { ProductListing } from '../../products/entities/product-listing.entity';

@Entity('markets')
export class Market {
  @PrimaryColumn({ type: 'char', length: 2 })
  code: string;

  @Column()
  name: string;

  @Column({ name: 'region_code', length: 40 })
  regionCode: string;

  @Column({ name: 'default_locale', length: 35 })
  defaultLocale: string;

  @Column({ name: 'supported_locales', type: 'text', array: true })
  supportedLocales: string[];

  @Column({ name: 'currency_code', type: 'char', length: 3 })
  currencyCode: string;

  @Column({ name: 'flag_emoji', length: 8 })
  flagEmoji: string;

  @Column({ name: 'time_zones', type: 'text', array: true, default: '{}' })
  timeZones: string[];

  @Column({ name: 'is_active', default: false })
  isActive: boolean;

  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder: number;

  @OneToMany(() => ProductListing, (listing) => listing.market)
  listings: ProductListing[];
}
