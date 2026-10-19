import { SearchService } from '../../services/search.service';
import type {
  SearchIntent,
  ResolvedSearchIntent,
} from '../../interfaces/search-intent.interface';
import { SearchRankingService } from '../../services/search-ranking.service';
import { SearchIntentService } from '../../services/search-intent.service';
import { ProductLexicalRepository } from '../../repositories/product-lexical.repository';
import { ProductVectorRepository } from '../../repositories/product-vector.repository';
import { VectorService } from '../../../ai/services/vector/vector.service';
import { MarketsService } from '../../../markets/markets.service';
import { ProductDimension } from '../../../../common/search/product-measurement';
import { ProductCondition } from '../../../products/enums/product-condition.enum';
import type { SearchProductResult } from '../../interfaces/search-result.interface';
import { SEARCH } from '../../search.constants';

const price = {
  currencyCode: 'BOB',
  maximum: { amount: 2000, inclusive: false },
};
const measurements = [
  {
    dimension: ProductDimension.WIDTH,
    maximum: { valueCm: 180, inclusive: true },
  },
];
const defaultIntent: SearchIntent = {
  text: 'escritorio',
  terms: ['escritorio'],
  categoryCode: 'DESK',
  price,
  measurements,
  condition: ProductCondition.USED,
};
const market = { currencyCode: 'BOB', exchangeRates: {} };
const interpretation: ResolvedSearchIntent['interpretation'] = {
  source: 'ai',
  summary: 'escritorio',
};

function setup(resolvedIntent: SearchIntent = defaultIntent) {
  const semantic = {
    isAvailable: jest.fn(() => true),
    generateEmbedding: jest.fn().mockResolvedValue([1]),
    toVectorString: () => '[1]',
  };
  const vectors = { findBySimilarity: jest.fn().mockResolvedValue([]) };
  const literal = {
    search: jest
      .fn<
        ReturnType<ProductLexicalRepository['search']>,
        Parameters<ProductLexicalRepository['search']>
      >()
      .mockResolvedValue([]),
  };
  const intent = {
    resolve: jest
      .fn()
      .mockResolvedValue({ intent: resolvedIntent, interpretation }),
  };
  const service = new SearchService(
    semantic as unknown as VectorService,
    vectors as unknown as ProductVectorRepository,
    literal as unknown as ProductLexicalRepository,
    intent as unknown as SearchIntentService,
    new SearchRankingService(),
    {
      requireActive: jest.fn().mockResolvedValue(market),
    } as unknown as MarketsService,
  );
  return { service, semantic, vectors, literal, intent };
}

describe('SearchService hybrid retrieval', () => {
  it('passes the same effective query to both retrieval paths', async () => {
    const { service, vectors, literal, intent } = setup();
    const dto = {
      query: 'escritorio menor a 2000',
      categoryCode: 'DESK',
      limit: 2,
    };
    const result = await service.searchHybrid(dto);
    const scope = { marketCode: 'BO', limit: 6 };
    const filters = {
      price,
      measurements,
      categoryCode: 'DESK',
      condition: ProductCondition.USED,
      materialAliases: undefined,
    };
    expect(intent.resolve).toHaveBeenCalledWith(
      dto.query,
      'es-BO',
      market,
      dto,
    );
    expect(vectors.findBySimilarity).toHaveBeenCalledWith({
      embedding: '[1]',
      scope,
      filters,
      threshold: SEARCH.DEFAULT_SIMILARITY_THRESHOLD,
    });
    expect(literal.search).toHaveBeenCalledWith(
      expect.objectContaining({ scope, filters }),
    );
    expect(result.interpretation).toEqual(interpretation);
  });

  it('continues literal retrieval when the embedding request fails', async () => {
    const { service, semantic, literal } = setup();
    semantic.generateEmbedding.mockRejectedValue(new Error('unavailable'));
    await expect(
      service.searchHybrid({ query: 'escritorio' }),
    ).resolves.toMatchObject({ results: [] });
    expect(literal.search).toHaveBeenCalledTimes(2);
    expect(semantic.generateEmbedding).toHaveBeenCalledTimes(1);
  });

  it('keeps literal retrieval available when embeddings are disabled', async () => {
    const { service, semantic, vectors, literal } = setup();
    semantic.isAvailable.mockReturnValue(false);
    await service.searchHybrid({ query: 'escritorio', categoryCode: 'DESK' });
    expect(semantic.generateEmbedding).not.toHaveBeenCalled();
    expect(vectors.findBySimilarity).not.toHaveBeenCalled();
    expect(literal.search).toHaveBeenCalledTimes(1);
  });

  it('retains semantic retrieval when interpretation has text without literal criteria', async () => {
    const { service, semantic } = setup({ text: 'escritorio', terms: [] });
    await service.searchHybrid({ query: 'escritorio' });
    expect(semantic.generateEmbedding).toHaveBeenCalledTimes(1);
  });

  it('does not request an embedding for a price-only interpretation', async () => {
    const { service, semantic, literal } = setup({
      text: '',
      terms: [],
      price,
    });
    await service.searchHybrid({ query: 'hasta 2000' });
    expect(semantic.generateEmbedding).not.toHaveBeenCalled();
    const [applied] = literal.search.mock.calls[0];
    expect(applied.filters.price).toEqual(price);
  });

  it('returns an empty response without retrieval for an empty interpretation', async () => {
    const { service, semantic, vectors, literal } = setup({
      text: '',
      terms: [],
    });
    expect(await service.searchHybrid({ query: 'consulta' })).toEqual({
      query: 'consulta',
      interpretation,
      results: [],
      relatedResults: [],
      count: 0,
    });
    expect(semantic.generateEmbedding).not.toHaveBeenCalled();
    expect(vectors.findBySimilarity).not.toHaveBeenCalled();
    expect(literal.search).not.toHaveBeenCalled();
  });

  it('broadens inferred categories while preserving mandatory constraints', async () => {
    const { service, semantic, vectors, literal } = setup();
    const alternative: SearchProductResult = {
      id: 'alternative',
      title: 'Escritorio',
      description: null,
      keywords: [],
      categoryCode: 'TABLE',
      categoryId: 'category',
      specifications: null,
      price: 1000,
      currencyCode: 'BOB',
      similarity: 0.9,
      stock: 1,
      sellerId: 'seller',
      imageUrl: null,
      createdAt: new Date(),
    };
    vectors.findBySimilarity
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([alternative]);
    const response = await service.searchHybrid({
      query: 'escritorio',
      limit: 2,
    });
    const scope = { marketCode: 'BO', limit: 6 };
    const filters = {
      price,
      measurements,
      condition: ProductCondition.USED,
      categoryCode: undefined,
      materialAliases: [],
    };
    expect(vectors.findBySimilarity).toHaveBeenNthCalledWith(2, {
      embedding: '[1]',
      scope,
      filters,
      threshold: SEARCH.DEFAULT_SIMILARITY_THRESHOLD,
    });
    expect(literal.search).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ scope, filters }),
    );
    expect(response.relatedResults.map((item) => item.id)).toEqual([
      'alternative',
    ]);
    expect(semantic.generateEmbedding).toHaveBeenCalledTimes(1);
  });

  it('keeps the selected category mandatory when broadening material suggestions', async () => {
    const { service, literal } = setup({
      ...defaultIntent,
      material: { label: 'Madera', aliases: ['madera', 'wood'] },
    });
    await service.searchHybrid({
      query: 'escritorio madera',
      categoryCode: 'DESK',
    });
    const [primary, broader] = literal.search.mock.calls.map(
      ([query]) => query.filters,
    );
    expect(primary).toMatchObject({
      categoryCode: 'DESK',
      materialAliases: ['madera', 'wood'],
    });
    expect(broader).toMatchObject({
      categoryCode: 'DESK',
      materialAliases: [],
      price,
      measurements,
      condition: ProductCondition.USED,
    });
  });

  it('reuses embeddings across preview/catalog calls while retrieving current result sets', async () => {
    const { service, semantic, literal } = setup();
    await Promise.all([
      service.searchHybrid({
        query: 'escritorio',
        categoryCode: 'DESK',
        limit: 10,
      }),
      service.searchHybrid({
        query: 'escritorio',
        categoryCode: 'DESK',
        limit: 20,
      }),
    ]);
    expect(semantic.generateEmbedding).toHaveBeenCalledTimes(1);
    expect(literal.search).toHaveBeenCalledTimes(2);
    expect(literal.search).toHaveBeenCalledWith(
      expect.objectContaining({ scope: { marketCode: 'BO', limit: 30 } }),
    );
    expect(literal.search).toHaveBeenCalledWith(
      expect.objectContaining({ scope: { marketCode: 'BO', limit: 60 } }),
    );
  });

  it('retries embeddings on the next search after a failure', async () => {
    const { service, semantic } = setup();
    semantic.generateEmbedding.mockRejectedValueOnce(new Error('timeout'));
    await service.searchHybrid({ query: 'escritorio', categoryCode: 'DESK' });
    await service.searchHybrid({ query: 'escritorio', categoryCode: 'DESK' });
    expect(semantic.generateEmbedding).toHaveBeenCalledTimes(2);
  });

  it('keeps the semantic batch endpoint defaults and response contract', async () => {
    const { service, vectors } = setup();
    expect(await service.searchBatch({ queries: ['escritorio'] })).toEqual([
      { query: 'escritorio', products: [] },
    ]);
    expect(vectors.findBySimilarity).toHaveBeenCalledWith({
      embedding: '[1]',
      scope: { marketCode: 'BO', limit: 5 },
      threshold: 0.5,
    });
  });
});
