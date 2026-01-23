import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    OneToMany,
    JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Category } from '../../categories/entities/category.entity';
import { ProductAsset } from './product-asset.entity';

export interface ProductSpecifications {
    weight?: string;
    dimensions?: {
        width: number;
        height: number;
        depth: number;
        unit: string;
    };
    material?: string;
    color?: string;
    [key: string]: unknown;
}

@Entity('products')
export class Product {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'seller_id' })
    sellerId: string;

    @Column({ name: 'category_id', nullable: true })
    categoryId: string;

    @Column()
    title: string;

    @Column('text', { nullable: true })
    description: string;

    @Column('decimal', { precision: 10, scale: 2 })
    price: number;

    @Column({ default: 0 })
    stock: number;

    @Column({ type: 'jsonb', nullable: true })
    specifications: ProductSpecifications;

    @Column('text', { array: true, default: '{}' })
    keywords: string[];

    /**
     * Vector embedding for semantic search (768 dimensions from Vertex AI text-embedding-004).
     * Requires pgvector extension: CREATE EXTENSION IF NOT EXISTS vector;
     */
    @Column('vector', { nullable: true })
    embedding: string;

    @CreateDateColumn()
    createdAt: Date;

    @ManyToOne(() => User, (user) => user.products, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'seller_id' })
    seller: User;

    @ManyToOne(() => Category, (category) => category.products, {
        onDelete: 'SET NULL',
        nullable: true,
    })
    @JoinColumn({ name: 'category_id' })
    category: Category;

    @OneToMany(() => ProductAsset, (asset) => asset.product, { cascade: true })
    assets: ProductAsset[];
}
