import { detectMaterialSearchIntent } from '../../../../common/search/product-material';
import { Product } from '../../../products/entities/product.entity';
import type { SearchInterpretationDto } from '../../dto/search-response.dto';
import type { SearchIntent } from '../../interfaces/search-intent.interface';
import { ProductLexicalRepository } from '../../repositories/product-lexical.repository';
import { ProductVectorRepository } from '../../repositories/product-vector.repository';
import { SearchIntentService } from '../../services/search-intent.service';
import { SearchRankingService } from '../../services/search-ranking.service';
import { SearchService } from '../../services/search.service';
import { VectorService } from '../../../ai/services/vector/vector.service';
import { MarketsService } from '../../../markets/markets.service';

const intent: SearchIntent = {
  text: 'quiero una silla de madera',
  terms: ['silla', 'madera'],
  categoryCode: 'CHAIR',
  aliases: ['silla', 'sillas'],
  aliasCategoryCodes: { silla: 'CHAIR', sillas: 'CHAIR' },
  relatedCategoryCodes: [],
  articles: ['', 'un ', 'una ', 'el ', 'la '],
  identityPrefixes: ['utilizarse como'],
  material: detectMaterialSearchIntent('silla de madera'),
};

const interpretation: SearchInterpretationDto = {
  summary: 'Silla · Madera',
  source: 'deterministic',
  category: { code: 'CHAIR', label: 'Silla' },
  material: { code: 'WOOD', label: 'Madera' },
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

function createService(): SearchService {
  const vectorService = {
    isAvailable: jest.fn().mockReturnValue(false),
  } as unknown as VectorService;
  const vectorRepository = {} as ProductVectorRepository;
  const lexicalRepository = {
    search: jest
      .fn()
      .mockResolvedValue([
        product('fallback', 'Silla ergonómica', 'Malla y metal'),
        product('partial', 'Silla mixta', 'Madera y metal'),
        product('full', 'Silla Toscana', 'Madera maciza'),
      ]),
  } as unknown as ProductLexicalRepository;
  const intentService = {
    resolve: jest.fn().mockResolvedValue({ intent, interpretation }),
  } as unknown as SearchIntentService;
  const marketsService = {
    requireActive: jest.fn().mockResolvedValue(undefined),
  } as unknown as MarketsService;

  return new SearchService(
    vectorService,
    vectorRepository,
    lexicalRepository,
    intentService,
    new SearchRankingService(),
    marketsService,
  );
}

describe('SearchService', () => {
  it('returns the interpretation and preserves material ranking', async () => {
    const response = await createService().searchHybrid({
      query: 'quiero una silla de madera',
      limit: 4,
    });

    expect(response.interpretation).toEqual(interpretation);
    expect(response.results.map(({ id }) => id)).toEqual(['full', 'partial']);
    expect(response.relatedResults.map(({ id }) => id)).toEqual(['fallback']);
  });

  it('omits fallback suggestions when direct matches fill the limit', async () => {
    const response = await createService().searchHybrid({
      query: 'quiero una silla de madera',
      limit: 2,
    });

    expect(response.results.map(({ id }) => id)).toEqual(['full', 'partial']);
    expect(response.relatedResults).toEqual([]);
  });
});
