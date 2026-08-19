import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Category } from '../modules/categories/entities/category.entity';
import { ProductAsset } from '../modules/products/entities/product-asset.entity';
import { Product } from '../modules/products/entities/product.entity';
import { User } from '../modules/users/entities/user.entity';
import { VendorProfile } from '../modules/users/entities/vendor-profile.entity';
import { InitialSchema1787070000000 } from './migrations/1787070000000-initial-schema';

const host = process.env.DB_HOST;
const usesCloudSqlSocket = host?.startsWith('/');

export default new DataSource({
  type: 'postgres',
  host,
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl:
    process.env.NODE_ENV === 'production' && !usesCloudSqlSocket
      ? { rejectUnauthorized: false }
      : false,
  extra: usesCloudSqlSocket ? { socketPath: host } : undefined,
  entities: [User, VendorProfile, Category, Product, ProductAsset],
  migrations: [InitialSchema1787070000000],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
});
