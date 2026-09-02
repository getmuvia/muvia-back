import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Check,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  OneToMany,
} from 'typeorm';
import { VendorProfile } from './vendor-profile.entity';
import { UserRole } from '../interfaces/user-role';
import { Product } from '../../products/entities/product.entity';

@Entity('users')
@Check(
  'CK_users_virtual_staging_quota_remaining',
  '"virtualStagingQuotaRemaining" BETWEEN 0 AND 10',
)
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ select: false })
  passwordHash: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.CONSUMER })
  role: UserRole;

  @Column({ type: 'smallint', default: 10 })
  virtualStagingQuotaRemaining: number;

  @Column({ type: 'date', nullable: true })
  virtualStagingQuotaDay: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToOne(() => VendorProfile, (profile) => profile.user, { cascade: true })
  vendorProfile: VendorProfile;

  @OneToMany(() => Product, (product) => product.seller)
  products: Product[];
}
