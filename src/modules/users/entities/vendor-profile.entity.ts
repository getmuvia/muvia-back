import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

export interface BusinessHours {
  [day: string]: {
    open: string;
    close: string;
    isClosed?: boolean;
  };
}

export interface SocialLink {
  name: string;
  url: string;
  icon: string;
}

@Entity('vendor_profiles')
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
  businessHours: BusinessHours;

  @Column({ default: false })
  isVerified: boolean;

  @OneToOne(() => User, (user) => user.vendorProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
