import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';

@Entity()
export class VendorProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  businessName: string;

  @Column('text')
  description: string;

  @Column({ nullable: true })
  logoUrl: string;

  @Column({ type: 'jsonb', nullable: true })
  businessHours: any; 

  @Column({ default: false })
  isVerified: boolean;

  @OneToOne(() => User, (user) => user.vendorProfile, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;
}
