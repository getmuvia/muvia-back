import { Product } from '../../../products/entities/product.entity';
import { ProductEmbeddingRepository } from '../../repositories/product-embedding.repository';
import { EmbeddingService } from './embedding.service';
import { VectorService } from '../vector/vector.service';

describe('EmbeddingService', () => {
  it('embeds category and structured specifications with product copy', async () => {
    const generateEmbedding = jest.fn().mockResolvedValue([0.1, 0.2]);
    const vectorService = {
      isAvailable: jest.fn().mockReturnValue(true),
      generateEmbedding,
      toVectorString: jest.fn().mockReturnValue('[0.1,0.2]'),
    } as unknown as VectorService;
    const service = new EmbeddingService(
      vectorService,
      {} as ProductEmbeddingRepository,
    );
    const product = {
      title: 'Escritorio ejecutivo',
      description: 'Mueble para oficina con dos cajones',
      category: { name: 'Escritorio', code: 'DESK' },
      specifications: {
        material: 'Melamina',
        color: 'Blanco',
        dimensions: { width: 120, height: 75, depth: 60, unit: 'cm' },
      },
      keywords: ['oficina', 'almacenamiento'],
    } as Product;

    await expect(service.createForProduct(product)).resolves.toBe('[0.1,0.2]');

    expect(generateEmbedding).toHaveBeenCalledTimes(1);
    const [document] = generateEmbedding.mock.calls[0] as [string];
    expect(document).toContain('Title: Escritorio ejecutivo');
    expect(document).toContain('Category: Escritorio DESK');
    expect(document).toContain('Specifications: material: Melamina');
    expect(document).toContain('dimensions.width: 120');
    expect(document).toContain('Keywords: oficina, almacenamiento');
  });
});
