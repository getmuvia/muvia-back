import type { SearchIntent } from '../../interfaces/search-intent.interface';
import type { SearchProductResult } from '../../interfaces/search-result.interface';
import { SearchRankingService } from '../../services/search-ranking.service';

const regionalIntent: SearchIntent = {
  text: 'placard de tablero melaminico',
  terms: ['placard', 'tablero', 'melaminico'],
  aliases: [],
  aliasCategoryCodes: { armario: 'WARDROBE' },
  relatedCategoryCodes: [],
  articles: ['', 'un ', 'una ', 'el ', 'la '],
  identityPrefixes: [],
  material: { aliases: ['tablero melaminico'] },
};

function semanticProduct(similarity: number): SearchProductResult {
  return {
    id: 'wardrobe-1',
    title: 'Armario contemporáneo',
    description: 'Mueble amplio para dormitorio',
    keywords: ['armario', 'dormitorio'],
    price: 2500,
    stock: 2,
    sellerId: 'seller-1',
    categoryId: 'category-1',
    categoryCode: 'WARDROBE',
    specifications: { material: 'Melamina' },
    currencyCode: 'BOB',
    imageUrl: null,
    similarity,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('SearchRankingService semantic evidence', () => {
  it('keeps a strong semantic-only regional match in primary results', () => {
    const ranking = new SearchRankingService();

    const response = ranking.rank([semanticProduct(0.82)], [], regionalIntent);

    expect(response.results).toEqual([
      expect.objectContaining({
        id: 'wardrobe-1',
        matchType: 'semantic',
        score: 0.82,
      }),
    ]);
    expect(response.relatedResults).toEqual([]);
  });

  it('keeps weaker semantic-only candidates as related results', () => {
    const ranking = new SearchRankingService();

    const response = ranking.rank([semanticProduct(0.35)], [], regionalIntent);

    expect(response.results).toEqual([]);
    expect(response.relatedResults).toEqual([
      expect.objectContaining({ id: 'wardrobe-1', matchType: 'semantic' }),
    ]);
  });
});
