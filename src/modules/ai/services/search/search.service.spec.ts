import { Product } from '../../../products/entities/product.entity';
import { CategoryTaxonomyService } from '../../../categories/category-taxonomy.service';
import { MarketsService } from '../../../markets/markets.service';
import { detectMaterialSearchIntent } from '../../../../common/search/product-material';
import { VectorService } from '../vector/vector.service';
import { ProductVectorRepository } from '../../repositories/product-vector.repository';
import { ProductLexicalRepository } from '../../repositories/product-lexical.repository';
import { SearchIntent } from './search-intent';
import { SearchService } from './search.service';

const intent: SearchIntent = {
  text: 'quiero una silla de madera',
  terms: ['silla', 'madera'],
  categoryCode: 'CHAIR',
  aliases: ['silla', 'sillas', 'chair', 'chairs'],
  aliasCategoryCodes: {
    silla: 'CHAIR',
    sillas: 'CHAIR',
    chair: 'CHAIR',
    chairs: 'CHAIR',
  },
  relatedCategoryCodes: [],
  articles: ['', 'un ', 'una ', 'el ', 'la '],
  identityPrefixes: ['utilizarse como'],
  material: detectMaterialSearchIntent('silla de madera'),
};

function product(id: string, title: string, material: string): Product {
  return {
    id,
    title,
    description: '',
    keywords: ['silla'],
    specifications: { material },
    price: 100,
    stock: 1,
    category: { code: 'CHAIR' },
    listings: [{ price: 100, stock: 1, currencyCode: 'BOB' }],
    assets: [],
  } as unknown as Product;
}

function createService() {
  const vectorService = {
    isAvailable: jest.fn().mockReturnValue(false),
  } as unknown as VectorService;
  const productVectorRepo = {} as ProductVectorRepository;
  const productLexicalRepo = {
    search: jest
      .fn()
      .mockResolvedValue([
        product('fallback', 'Silla ergonómica', 'Malla y metal'),
        product('partial', 'Silla mixta', 'Madera y metal'),
        product('full', 'Silla Toscana', 'Madera maciza'),
      ]),
  } as unknown as ProductLexicalRepository;
  const categoryTaxonomyService = {
    createSearchIntent: jest.fn().mockResolvedValue(intent),
  } as unknown as CategoryTaxonomyService;
  const marketsService = {
    requireActive: jest.fn().mockResolvedValue(undefined),
  } as unknown as MarketsService;

  return new SearchService(
    vectorService,
    productVectorRepo,
    productLexicalRepo,
    categoryTaxonomyService,
    marketsService,
  );
}

describe('SearchService material ranking', () => {
  it('ranks full material, then partial material, and separates fallback products', async () => {
    const response = await createService().searchHybrid({
      query: 'quiero una silla de madera',
      limit: 4,
    });

    expect(response.results.map(({ id }) => id)).toEqual(['full', 'partial']);
    expect(response.relatedResults.map(({ id }) => id)).toEqual(['fallback']);
    expect(response.count).toBe(2);
  });

  it('omits fallback suggestions when direct matches fill the requested limit', async () => {
    const response = await createService().searchHybrid({
      query: 'quiero una silla de madera',
      limit: 2,
    });

    expect(response.results.map(({ id }) => id)).toEqual(['full', 'partial']);
    expect(response.relatedResults).toEqual([]);
  });
});
