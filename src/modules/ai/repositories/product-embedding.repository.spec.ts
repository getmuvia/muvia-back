import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Product } from '../../products/entities/product.entity';
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
      ['[0.1,0.2]', 'gemini-embedding-001', 'product-1'],
    );
  });
});
