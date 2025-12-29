import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { Product } from './product.entity';
import { AssetType } from '../enums/asset-type.enum';

export interface AssetMetadata {
    // For 3D models
    scale?: string;
    arPlacement?: 'floor' | 'wall' | 'table';
    format?: string;
    // For images
    alt?: string;
    width?: number;
    height?: number;
    [key: string]: unknown;
}

@Entity('product_assets')
export class ProductAsset {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'product_id' })
    productId: string;

    @Column()
    url: string;

    @Column({ type: 'enum', enum: AssetType, default: AssetType.IMAGE })
    type: AssetType;

    @Column({ default: false })
    isPrimary: boolean;

    @Column({ type: 'jsonb', nullable: true })
    metadata: AssetMetadata;

    @ManyToOne(() => Product, (product) => product.assets, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'product_id' })
    product: Product;
}
