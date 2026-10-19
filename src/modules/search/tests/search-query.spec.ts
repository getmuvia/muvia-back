import { ProductDimension } from '../../../common/search/product-measurement';
import { ProductCondition } from '../../products/enums/product-condition.enum';
import type { SearchIntent } from '../interfaces/search-intent.interface';
import { SearchQuery } from '../search-query';

const scope = { marketCode: 'BO', limit: 30 };
function query(intent: Partial<SearchIntent> = {}): SearchQuery {
  return SearchQuery.fromIntent({
    scope,
    intent: { text: '', terms: [], ...intent },
  });
}

describe('SearchQuery', () => {
  it('distinguishes semantic text from criteria that can retrieve lexical candidates', () => {
    expect(query().hasSearchCriteria()).toBe(false);
    expect(query().hasLexicalCriteria()).toBe(false);
    const semantic = query({ text: 'un lugar cómodo para leer' });
    expect(semantic.hasSearchCriteria()).toBe(true);
    expect(semantic.hasLexicalCriteria()).toBe(false);
  });

  it.each<Partial<SearchIntent>>([
    { terms: ['silla'] },
    { productTerms: ['asiento'] },
    { categoryCode: 'DESK' },
    { condition: ProductCondition.USED },
    { material: { label: 'Madera', aliases: ['madera'] } },
    { price: { currencyCode: 'BOB', minimum: { amount: 0, inclusive: true } } },
    {
      measurements: [
        {
          dimension: ProductDimension.WIDTH,
          maximum: { valueCm: 100, inclusive: true },
        },
      ],
    },
  ])('accepts each supported retrieval criterion on its own: %j', (intent) => {
    const search = query(intent);
    expect(search.hasSearchCriteria()).toBe(true);
    expect(search.hasLexicalCriteria()).toBe(true);
  });

  it('broadens inferred preferences without modifying the primary query or mandatory filters', () => {
    const search = query({
      text: 'escritorio madera',
      terms: ['escritorio'],
      categoryCode: 'DESK',
      material: { label: 'Madera', aliases: ['madera'] },
      condition: ProductCondition.USED,
      price: {
        currencyCode: 'BOB',
        maximum: { amount: 1000, inclusive: false },
      },
      measurements: [
        {
          dimension: ProductDimension.WIDTH,
          maximum: { valueCm: 100, inclusive: true },
        },
      ],
    });
    const primaryFilters = structuredClone(search.filters);
    const broader = search.broaden();
    expect(broader?.scope).toEqual(scope);
    expect(broader?.criteria).toEqual(search.criteria);
    expect(broader?.filters).toEqual({
      ...primaryFilters,
      categoryCode: undefined,
      materialAliases: [],
    });
    expect(search.filters).toEqual(primaryFilters);
    expect(search.broaden('DESK')?.filters.categoryCode).toBe('DESK');
  });

  it('does not broaden a selected category without material preferences', () => {
    expect(
      query({ categoryCode: 'DESK', terms: ['escritorio'] }).broaden('DESK'),
    ).toBeUndefined();
  });

  it('does not turn a category-only interpretation into an unrestricted search', () => {
    expect(query({ categoryCode: 'DESK' }).broaden()).toBeUndefined();
  });
});
