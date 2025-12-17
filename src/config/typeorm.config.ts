import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const typeOrmConfig = async (
    configService: ConfigService,
): Promise<TypeOrmModuleOptions> => {
    const isProduction = configService.get<string>('NODE_ENV') === 'production';

    return {
        type: 'postgres',

        host: configService.get<string>('DB_HOST'),
        port: configService.get<number>('DB_PORT'),
        username: configService.get<string>('DB_USERNAME'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_NAME'),

        autoLoadEntities: true,

        synchronize: !isProduction,

        ssl: isProduction ? { rejectUnauthorized: false } : false,

        logging: !isProduction,
    };
};
