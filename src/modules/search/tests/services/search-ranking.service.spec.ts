import type { SearchIntent } from '../../interfaces/search-intent.interface';
import type { SearchProductResult } from '../../interfaces/search-result.interface';
import { Product } from '../../../products/entities/product.entity';
import { SearchRankingService } from '../../services/search-ranking.service';

const intent: SearchIntent = {
  text: 'armario melamina',
  terms: ['armario', 'melamina'],
  categoryCode: 'WARDROBE',
  material: { label: 'Melamina', aliases: ['melamina', 'tablero melaminico'] },
};
const product: SearchProductResult = {
  id: 'wardrobe-1',
  title: 'Armario contemporÃ¡neo',
  description: 'Mueble de melamina',
  keywords: ['armario'],
  specifications: { material: 'Melamina' },
  price: 2500,
  stock: 2,
  currencyCode: 'BOB',
  sellerId: 'seller',
  categoryId: 'category',
  categoryCode: 'WARDROBE',
  imageUrl: null,
  similarity: 0.82,
  createdAt: new Date(),
};

describe('SearchRankingService', () => {
  const ranking = new SearchRankingService();
  it('keeps strong semantic matches and separates weaker candidates', () => {
    expect(ranking.rank([product], [], intent).results[0].score).toBe(0.82);
    expect(
      ranking.rank([{ ...product, similarity: 0.35 }], [], intent)
        .relatedResults[0].id,
    ).toBe(product.id);
  });
  it('uses stored category and material instead of interpreting components in descriptions', () => {
    const mismatch = {
      ...product,
      categoryCode: 'TABLE',
      description: 'Se puede usar como armario',
      specifications: { material: 'Metal con patas de madera' },
    };
    expect(ranking.rank([mismatch], [], intent).results).toEqual([]);
    expect(ranking.rank([mismatch], [], intent).relatedResults).toHaveLength(1);
  });
  it('merges matching literal and semantic products without duplicates', () => {
    const literal = {
      ...product,
      category: { code: 'WARDROBE' },
      listings: [{ price: 2500, currencyCode: 'BOB' }],
      assets: [],
    } as unknown as Product;
    const result = ranking.rank([product], [literal], intent);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].matchType).toBe('hybrid');
  });
});
