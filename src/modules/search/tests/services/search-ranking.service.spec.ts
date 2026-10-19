import type { SearchIntent } from '../../interfaces/search-intent.interface';
import type { SearchProductResult } from '../../interfaces/search-result.interface';
import { Product } from '../../../products/entities/product.entity';
import { SearchRankingService } from '../../services/search-ranking.service';

const intent: SearchIntent = {
  text: 'armario melamina',
  terms: ['armario', 'melamina'],
  productTerms: ['armario', 'guardarropa'],
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
  category: { id: 'category', code: 'WARDROBE', name: 'Wardrobes' },
  imageUrl: null,
  similarity: 0.82,
  createdAt: new Date(),
};

describe('SearchRankingService', () => {
  const ranking = new SearchRankingService();
  it('keeps strong semantic matches and separates weaker candidates', () => {
    expect(ranking.rank([product], [], intent).results[0].score).toBe(0.82);
    expect(ranking.rank([product], [], intent).results[0].category).toEqual(
      product.category,
    );
    expect(
      ranking.rank([{ ...product, similarity: 0.35 }], [], intent)
        .relatedResults[0].id,
    ).toBe(product.id);
  });
  it('uses stored category and material instead of interpreting components in descriptions', () => {
    const mismatch = {
      ...product,
      categoryCode: 'TABLE',
      category: { id: 'table', code: 'TABLE', name: 'Tables' },
      description: 'Se puede usar como armario',
      specifications: { material: 'Metal con patas de madera' },
    };
    expect(ranking.rank([mismatch], [], intent).results).toEqual([]);
    expect(ranking.rank([mismatch], [], intent).relatedResults).toHaveLength(1);
    expect(
      ranking.rank([mismatch], [], intent).relatedResults[0].category,
    ).toEqual(mismatch.category);
  });
  it('merges matching literal and semantic products without duplicates', () => {
    const literal = {
      ...product,
      category: product.category,
      listings: [{ price: 2500, currencyCode: 'BOB' }],
      assets: [],
    } as unknown as Product;
    const result = ranking.rank([product], [literal], intent);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].matchType).toBe('hybrid');
    expect(result.results[0].category).toEqual(product.category);
  });

  it('does not promote an attribute-only literal match to primary results', () => {
    const unrelated = {
      ...product,
      id: 'attribute-only',
      title: 'Mesa de melamina',
      description: '',
      keywords: [],
      category: product.category,
      assets: [],
    } as unknown as Product;
    const result = ranking.rank([], [unrelated], intent);
    expect(result.results).toEqual([]);
    expect(result.relatedResults.map((item) => item.id)).toEqual([
      'attribute-only',
    ]);
  });

  it('scores lexical prefixes consistently and keeps repeated lexical candidates lexical', () => {
    const literal = {
      ...product,
      title: 'Armarios de melamina',
      description: '',
      keywords: [],
      category: product.category,
      assets: [],
    } as unknown as Product;
    const result = ranking.rank([], [literal, literal], intent);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({ score: 1, matchType: 'lexical' });
    expect(result.results[0].category).toEqual(product.category);
  });

  it('keeps uncategorized products explicit in semantic and lexical results', () => {
    const uncategorized = {
      ...product,
      categoryId: null,
      categoryCode: null,
      category: null,
    };
    const literal = {
      ...uncategorized,
      id: 'lexical',
      assets: [],
    } as unknown as Product;
    const result = ranking.rank([uncategorized], [literal], {
      ...intent,
      categoryCode: undefined,
    });
    expect(result.results).toHaveLength(2);
    expect(result.results.map((item) => item.category)).toEqual([null, null]);
  });
});
