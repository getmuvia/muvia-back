import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Product } from '../../products/entities/product.entity';
import { PRODUCT_EMBEDDING_CONTENT_VERSION } from '../constants/ai.constants';
import { ProductEmbeddingRepository } from './product-embedding.repository';

describe('ProductEmbeddingRepository', () => {
  it('stores the vector with the configured embedding model', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const typeOrmRepository = {
      query,
    } as unknown as Repository<Product>;
    const configService = {
      getOrThrow: jest.fn().mockReturnValue('gemini-embedding-001'),
    } as unknown as ConfigService;
    const repository = new ProductEmbeddingRepository(
      typeOrmRepository,
      configService,
    );

    await repository.updateEmbedding('product-1', '[0.1,0.2]');

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('embedding_model = $2'),
      [
        '[0.1,0.2]',
        'gemini-embedding-001',
        PRODUCT_EMBEDDING_CONTENT_VERSION,
        'product-1',
      ],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('embedding_content_version = $3'),
      expect.any(Array),
    );
  });

  it('selects outdated document versions for regeneration with category data', async () => {
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const typeOrmRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    } as unknown as Repository<Product>;
    const configService = {
      getOrThrow: jest.fn().mockReturnValue('gemini-embedding-001'),
    } as unknown as ConfigService;
    const repository = new ProductEmbeddingRepository(
      typeOrmRepository,
      configService,
    );

    await expect(repository.findPendingEmbeddingRefresh()).resolves.toEqual([]);

    expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
      'product.category',
      'category',
    );
    expect(queryBuilder.orWhere).toHaveBeenCalledWith(
      'product.embedding_content_version IS DISTINCT FROM :contentVersion',
      { contentVersion: PRODUCT_EMBEDDING_CONTENT_VERSION },
    );
  });
});
