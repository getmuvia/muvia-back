import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { ProductDimension } from '../../../../common/search/product-measurement';
import { Product } from '../../../products/entities/product.entity';
import { ProductVectorRepository } from '../../repositories/product-vector.repository';

describe('ProductVectorRepository', () => {
  it('filters by the configured embedding model and optional measurement', async () => {
    const typeOrmRepository = {
      query: jest.fn().mockResolvedValue([]),
    } as unknown as Repository<Product>;
    const configService = {
      getOrThrow: jest.fn().mockReturnValue('gemini-embedding-001'),
    } as unknown as ConfigService;
    const repository = new ProductVectorRepository(
      typeOrmRepository,
      configService,
    );

    await repository.findBySimilarity('[0.1,0.2]', 5, 0.3, 'BO', {
      dimension: ProductDimension.WIDTH,
      maxDimensionCm: 100,
    });

    const [query, parameters] = (typeOrmRepository.query as jest.Mock).mock
      .calls[0] as [string, unknown[]];
    expect(query).toContain('p.embedding_model = $5');
    expect(query).toContain('<= $7');
    expect(parameters).toEqual([
      '[0.1,0.2]',
      0.3,
      'BO',
      5,
      'gemini-embedding-001',
      '^\\d+(\\.\\d+)?$',
      100,
    ]);
  });
});
