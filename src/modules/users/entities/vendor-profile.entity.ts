import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Check,
  OneToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { VendorLocation } from './vendor-location.entity';

import { BusinessHoursDto } from '../dto/create-vendor-profile.dto';

export interface SocialLink {
  name: string;
  url: string;
  icon: string;
}

@Entity('vendor_profiles')
@Check(
  'ck_vendor_repair_settings',
  `(offers_repairs AND repair_scope IS NOT NULL AND length(btrim(repair_scope)) > 0)
    OR (NOT offers_repairs AND repair_scope IS NULL AND repair_details IS NULL
      AND NOT repairs_external_products)`,
)
export class VendorProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column()
  businessName: string;

  @Column('text', { nullable: true })
  description: string;

  @Column({ nullable: true })
  logoUrl: string;

  @Column({ nullable: true })
  coverImage: string;

  @Column({ length: 150, nullable: true })
  aboutMe: string;

  @Column({ type: 'jsonb', nullable: true })
  socialLinks: SocialLink[];

  @Column({ type: 'jsonb', nullable: true })
  businessHours: BusinessHoursDto;

  @Column({ default: false })
  isVerified: boolean;

  @Column({ name: 'offers_repairs', default: false })
  offersRepairs: boolean;

  @Column({
    name: 'repair_scope',
    type: 'varchar',
    length: 160,
    nullable: true,
  })
  repairScope: string | null;

  @Column({
    name: 'repair_details',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  repairDetails: string | null;

  @Column({ name: 'repairs_external_products', default: false })
  repairsExternalProducts: boolean;

  @OneToOne(() => User, (user) => user.vendorProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @OneToMany(() => VendorLocation, (location) => location.vendorProfile, {
    cascade: true,
  })
  locations: VendorLocation[];
}
