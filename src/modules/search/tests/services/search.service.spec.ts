import { SearchService } from '../../services/search.service';
import type { ResolvedSearchIntent } from '../../interfaces/search-intent.interface';
import { SearchRankingService } from '../../services/search-ranking.service';
import { SearchIntentService } from '../../services/search-intent.service';
import { ProductLexicalRepository } from '../../repositories/product-lexical.repository';
import { ProductVectorRepository } from '../../repositories/product-vector.repository';
import { VectorService } from '../../../ai/services/vector/vector.service';
import { MarketsService } from '../../../markets/markets.service';
import { ProductDimension } from '../../../../common/search/product-measurement';
import { ProductCondition } from '../../../products/enums/product-condition.enum';

describe('SearchService hybrid retrieval', () => {
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
  const market = { currencyCode: 'BOB', exchangeRates: {} };
  const interpretation = { source: 'ai', summary: 'escritorio' };
  function setup() {
    const semantic = {
      isAvailable: jest.fn(() => true),
      generateEmbedding: jest.fn().mockResolvedValue([1]),
      toVectorString: () => '[1]',
    };
    const vectors = { findBySimilarity: jest.fn().mockResolvedValue([]) };
    const literal = { search: jest.fn().mockResolvedValue([]) };
    const intent = {
      resolve: jest.fn().mockResolvedValue({
        intent: {
          text: 'escritorio',
          terms: ['escritorio'],
          categoryCode: 'DESK',
          price,
          measurements,
          condition: ProductCondition.USED,
        },
        interpretation,
      }),
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
  it('passes the same constraints to both retrieval paths before limiting', async () => {
    const { service, vectors, literal, intent } = setup();
    const dto = {
      query: 'escritorio menor a 2000',
      categoryCode: 'DESK',
      limit: 2,
    };
    const result = await service.searchHybrid(dto);
    expect(intent.resolve).toHaveBeenCalledWith(
      dto.query,
      'es-BO',
      market,
      dto,
    );
    expect(vectors.findBySimilarity).toHaveBeenCalledWith(
      '[1]',
      6,
      expect.any(Number),
      'BO',
      measurements,
      ProductCondition.USED,
      price,
      'DESK',
      [],
    );
    expect(literal.search).toHaveBeenCalledWith(
      expect.objectContaining({ price, measurements }),
      6,
      'BO',
      ProductCondition.USED,
      'DESK',
      [],
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
  it('retains semantic retrieval when the interpreter returns text without literal terms', async () => {
    const { service, semantic, intent } = setup();
    intent.resolve.mockResolvedValue({
      intent: { text: 'escritorio', terms: [] },
      interpretation,
    } as never);
    await service.searchHybrid({ query: 'escritorio' });
    expect(semantic.generateEmbedding).toHaveBeenCalledTimes(1);
  });

  it('does not request an embedding for a price-only interpretation', async () => {
    const { service, semantic, intent } = setup();
    intent.resolve.mockResolvedValue({
      intent: { text: '', terms: [], price },
      interpretation,
    } as never);
    await service.searchHybrid({ query: 'hasta 2000' });
    expect(semantic.generateEmbedding).not.toHaveBeenCalled();
  });

  it('broadens an inferred category without weakening numeric or condition filters', async () => {
    const { service, semantic, vectors, literal } = setup();
    const alternative = {
      id: 'alternative',
      title: 'Escritorio',
      categoryCode: 'TABLE',
      specifications: {},
      price: 1000,
      currencyCode: 'BOB',
      similarity: 0.9,
    };
    vectors.findBySimilarity
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([alternative] as never);
    const response = await service.searchHybrid({
      query: 'escritorio',
      limit: 2,
    });
    expect(vectors.findBySimilarity).toHaveBeenNthCalledWith(
      2,
      '[1]',
      6,
      expect.any(Number),
      'BO',
      measurements,
      ProductCondition.USED,
      price,
      undefined,
      [],
    );
    expect(literal.search).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ price, measurements }),
      6,
      'BO',
      ProductCondition.USED,
      undefined,
      [],
    );
    expect(response.relatedResults.map((item) => item.id)).toEqual([
      'alternative',
    ]);
    expect(semantic.generateEmbedding).toHaveBeenCalledTimes(1);
  });

  it('keeps the selected category mandatory when broadening material suggestions', async () => {
    const { service, literal, intent } = setup();
    const resolved = (await intent.resolve()) as ResolvedSearchIntent;
    intent.resolve.mockResolvedValue({
      ...resolved,
      intent: {
        ...resolved.intent,
        material: { label: 'Madera', aliases: ['madera', 'wood'] },
      },
    } as never);
    await service.searchHybrid({
      query: 'escritorio madera',
      categoryCode: 'DESK',
    });
    expect(literal.search).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      30,
      'BO',
      ProductCondition.USED,
      'DESK',
      ['madera', 'wood'],
    );
    expect(literal.search).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      30,
      'BO',
      ProductCondition.USED,
      'DESK',
      [],
    );
  });

  it('reuses embeddings across concurrent preview/catalog requests while retrieving each result set', async () => {
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
    const calls = literal.search.mock.calls as unknown as [unknown, number][];
    expect(calls.map((call) => call[1])).toEqual([30, 60]);
  });

  it('retries embeddings on the next search after a failure', async () => {
    const { service, semantic } = setup();
    semantic.generateEmbedding.mockRejectedValueOnce(new Error('timeout'));
    await service.searchHybrid({ query: 'escritorio', categoryCode: 'DESK' });
    await service.searchHybrid({ query: 'escritorio', categoryCode: 'DESK' });
    expect(semantic.generateEmbedding).toHaveBeenCalledTimes(2);
  });
});
