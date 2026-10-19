import { BadRequestException } from '@nestjs/common';
import { ProductDimension } from '../../../../common/search/product-measurement';
import { CategoryTaxonomyService } from '../../../categories/category-taxonomy.service';
import { Market } from '../../../markets/entities/market.entity';
import { ProductCondition } from '../../../products/enums/product-condition.enum';
import type {
  SearchIntentProvider,
  SearchIntentCandidate,
} from '../../interfaces/search-intent-provider.interface';
import { SearchIntentService } from '../../services/search-intent.service';

const categories = [
  { code: 'DESK', label: 'Escritorio', aliases: ['escritorio', 'desk'] },
];
const market = {
  code: 'BO',
  currencyCode: 'BOB',
  exchangeRates: { USD: { rate: 10, updatedAt: '2026-10-18' } },
} as Market;
const candidate: SearchIntentCandidate = {
  cleanQuery: 'escritorio de madera',
  terms: ['escritorio', 'madera'],
  categoryCode: 'DESK',
  material: { label: 'Madera', aliases: ['madera', 'wood'] },
  measurement: { dimension: ProductDimension.WIDTH, maxDimensionCm: 180 },
  price: { currencyCode: 'USD', maximum: { amount: 500, inclusive: true } },
};
function setup(value: SearchIntentCandidate = candidate) {
  const interpret = jest.fn().mockResolvedValue(value);
  const isAvailable = jest.fn(() => true);
  const provider = {
    isAvailable,
    interpret,
  } as unknown as SearchIntentProvider;
  const taxonomy = {
    getSearchCategories: jest.fn().mockResolvedValue(categories),
  } as unknown as CategoryTaxonomyService;
  return {
    service: new SearchIntentService(taxonomy, provider),
    provider,
    interpret,
    isAvailable,
  };
}

describe('SearchIntentService', () => {
  it('passes the complete original query and market vocabulary in one interpretation call', async () => {
    const { service, interpret } = setup();
    const query =
      'quiero un escritorio de madera de hasta 180 cm de ancho que no pase de 500 dÃ³lares';
    const result = await service.resolve(query, 'es-BO', market);
    expect(interpret).toHaveBeenCalledTimes(1);
    expect(interpret).toHaveBeenCalledWith({
      query,
      locale: 'es-BO',
      currencyCode: 'BOB',
      supportedCurrencies: ['BOB', 'USD'],
      categories,
    });
    expect(result.intent).toMatchObject({
      text: 'escritorio de madera',
      terms: ['escritorio', 'madera'],
      measurement: candidate.measurement,
      price: {
        currencyCode: 'BOB',
        maximum: { amount: 5000, inclusive: true },
      },
    });
    expect(result.interpretation.source).toBe('ai');
  });

  it('keeps local budgets unchanged and preserves exclusive comparisons', async () => {
    const price = {
      currencyCode: 'BOB',
      maximum: { amount: 2000, inclusive: false },
    };
    const { service } = setup({ ...candidate, price });
    expect(
      (await service.resolve('escritorio menor a 2000', 'es-BO', market)).intent
        .price,
    ).toEqual(price);
  });

  it.each([
    [true, true, 3.34],
    [true, false, 3.33],
    [false, true, 3.33],
    [false, false, 3.34],
  ])(
    'preserves cent boundaries after conversion (minimum=%s, inclusive=%s)',
    async (minimum, inclusive, amount) => {
      const bound = { amount: 1, inclusive };
      const { service } = setup({
        ...candidate,
        price: {
          currencyCode: 'USD',
          ...(minimum ? { minimum: bound } : { maximum: bound }),
        },
      });
      const result = await service.resolve('presupuesto', 'es-BO', {
        ...market,
        exchangeRates: { USD: { rate: 3.333333, updatedAt: 'today' } },
      });
      expect(
        minimum ? result.intent.price?.minimum : result.intent.price?.maximum,
      ).toEqual({ amount, inclusive });
    },
  );

  it('uses the selected market currency when converting in another country', async () => {
    const { service } = setup();
    const peru = {
      ...market,
      code: 'PE',
      currencyCode: 'PEN',
      exchangeRates: { USD: { rate: 4, updatedAt: 'today' } },
    };
    expect(
      (await service.resolve('escritorio hasta 500 dÃ³lares', 'es-PE', peru))
        .intent.price?.maximum?.amount,
    ).toBe(2000);
  });

  it('rejects an explicit unsupported currency instead of silently treating it as local', async () => {
    const { service } = setup({
      ...candidate,
      price: {
        currencyCode: 'CNY',
        maximum: { amount: 5000, inclusive: false },
      },
    });
    await expect(
      service.resolve('escritorio menor a 5000 yuanes', 'es-BO', market),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('continues keyword retrieval when Gemini times out, preserving selected controls', async () => {
    const { service, interpret } = setup();
    interpret.mockRejectedValue(new Error('timeout'));
    const result = await service.resolve('escritorio madera', 'es-BO', market, {
      categoryCode: 'DESK',
      condition: ProductCondition.USED,
      dimension: ProductDimension.WIDTH,
      maxDimensionCm: 100,
    });
    expect(result.intent).toMatchObject({
      terms: ['escritorio', 'madera'],
      categoryCode: 'DESK',
      condition: 'USED',
      measurement: { dimension: 'width', maxDimensionCm: 100 },
    });
    expect(result.intent.price).toBeUndefined();
    expect(result.interpretation.source).toBe('deterministic');
  });

  it('continues keyword retrieval when interpretation is disabled', async () => {
    const { service, isAvailable, interpret } = setup();
    isAvailable.mockReturnValue(false);
    expect(
      (await service.resolve('silla madera', 'es-BO', market)).interpretation
        .source,
    ).toBe('deterministic');
    expect(interpret).not.toHaveBeenCalled();
  });
});
