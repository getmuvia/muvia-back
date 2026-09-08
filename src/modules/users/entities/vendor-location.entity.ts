import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { VendorProfile } from './vendor-profile.entity';
import { ProductListing } from '../../products/entities/product-listing.entity';

@Entity('vendor_locations')
export class VendorLocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'vendor_profile_id' })
  vendorProfileId: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  label: string | null;

  @Column({ name: 'country_code', type: 'char', length: 2 })
  countryCode: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  region: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  city: string | null;

  @Column({ name: 'is_primary', default: false })
  isPrimary: boolean;

  @ManyToOne(() => VendorProfile, (profile) => profile.locations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vendor_profile_id' })
  vendorProfile: VendorProfile;

  @OneToMany(() => ProductListing, (listing) => listing.vendorLocation)
  listings: ProductListing[];
}
