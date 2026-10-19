import { SearchService } from '../../services/search.service';
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
  const measurement = {
    dimension: ProductDimension.WIDTH,
    maxDimensionCm: 180,
  };
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
          measurement,
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
      measurement,
      ProductCondition.USED,
      price,
      'DESK',
    );
    expect(literal.search).toHaveBeenCalledWith(
      expect.objectContaining({ price, measurement }),
      6,
      'BO',
      ProductCondition.USED,
      'DESK',
    );
    expect(result.interpretation).toEqual(interpretation);
  });
  it('continues literal retrieval when the embedding request fails', async () => {
    const { service, semantic, literal } = setup();
    semantic.generateEmbedding.mockRejectedValue(new Error('unavailable'));
    await expect(
      service.searchHybrid({ query: 'escritorio' }),
    ).resolves.toMatchObject({ results: [] });
    expect(literal.search).toHaveBeenCalledTimes(1);
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
});
