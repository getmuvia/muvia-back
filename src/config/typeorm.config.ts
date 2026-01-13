import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const typeOrmConfig = async (
  configService: ConfigService,
): Promise<TypeOrmModuleOptions> => {
  const isProduction = configService.get<string>('NODE_ENV') === 'production';
  const host = configService.get<string>('DB_HOST');
  
  const isGoogleCloudSocket = host?.startsWith('/');

  return {
    type: 'postgres',
    host: host,

    port: parseInt(configService.get<string>('DB_PORT') || '5432', 10),
    username: configService.get<string>('DB_USERNAME'),
    password: configService.get<string>('DB_PASSWORD'),
    database: configService.get<string>('DB_NAME'),

    autoLoadEntities: true,

    synchronize: !isProduction, 

    ssl: isProduction && !isGoogleCloudSocket ? { rejectUnauthorized: false } : false,
    
    extra: isGoogleCloudSocket ? {
        socketPath: host
    } : undefined,

    logging: !isProduction,
    uuidExtension: 'pgcrypto',
  };
};
