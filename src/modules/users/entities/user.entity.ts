import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToOne, OneToMany } from 'typeorm';
import { VendorProfile } from './vendor-profile.entity';
// Importaremos Product más adelante para evitar referencias circulares ahora mismo
// import { Product } from '../../products/entities/product.entity';

export enum UserRole {
  ADMIN = 'admin',
  VENDOR = 'vendor',
  CONSUMER = 'consumer',
}

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ select: false })
  password: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.CONSUMER })
  role: UserRole;

  @CreateDateColumn()
  createdAt: Date;

  @OneToOne(() => VendorProfile, (profile) => profile.user, { cascade: true })
  vendorProfile: VendorProfile;
}
