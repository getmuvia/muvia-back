import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    OneToMany,
    JoinColumn,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity';
import { CategoryTranslation } from './category-translation.entity';
import { CategoryAlias } from './category-alias.entity';
import { CategoryRelation } from './category-relation.entity';

@Entity('categories')
export class Category {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'parent_id', nullable: true })
    parentId: string | null;

    @Column()
    name: string;

    @Column({ unique: true })
    code: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ nullable: true })
    imageUrl: string;

    @Column({ default: 0 })
    level: number;

    @Column({ name: 'is_selectable', default: true })
    isSelectable: boolean;

    @ManyToOne(() => Category, (category) => category.subcategories, {
        onDelete: 'CASCADE',
        nullable: true,
    })
    @JoinColumn({ name: 'parent_id' })
    parent: Category;

    @OneToMany(() => Category, (category) => category.parent)
    subcategories: Category[];

    @OneToMany(() => Product, (product) => product.category)
    products: Product[];

    @OneToMany(() => CategoryTranslation, (translation) => translation.category)
    translations: CategoryTranslation[];

    @OneToMany(() => CategoryAlias, (alias) => alias.category)
    aliases: CategoryAlias[];

    @OneToMany(() => CategoryRelation, (relation) => relation.sourceCategory)
    outgoingRelations: CategoryRelation[];
}
