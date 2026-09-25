import { ProductDimension } from '../../../../common/search/product-measurement';
import { CategoryTaxonomyService } from '../../../categories/category-taxonomy.service';
import type { SearchIntentProvider } from '../../interfaces/search-intent-provider.interface';
import type { SearchIntent } from '../../interfaces/search-intent.interface';
import { SearchIntentService } from '../../services/search-intent.service';

const baseIntent: SearchIntent = {
  text: 'mueble de 100 cm',
  terms: ['mueble', '100', 'cm'],
  aliases: [],
  aliasCategoryCodes: { escritorio: 'DESK' },
  relatedCategoryCodes: [],
  articles: ['', 'un ', 'una ', 'el ', 'la '],
  identityPrefixes: ['utilizarse como'],
};

const deskIntent: SearchIntent = {
  ...baseIntent,
  text: 'escritorio',
  terms: ['escritorio'],
  categoryCode: 'DESK',
  aliases: ['escritorio', 'escritorios'],
};

describe('SearchIntentService', () => {
  it('enriches deterministic intent with a validated AI interpretation', async () => {
    const taxonomy = {
      createSearchIntent: jest.fn((query: string) =>
        Promise.resolve(query === 'escritorio' ? deskIntent : baseIntent),
      ),
    } as unknown as CategoryTaxonomyService;
    const provider = {
      isAvailable: jest.fn().mockReturnValue(true),
      interpret: jest.fn().mockResolvedValue({
        category: 'escritorio',
        material: 'madera',
        measurement: {
          dimension: ProductDimension.WIDTH,
          maxDimensionCm: 100,
        },
      }),
    } as unknown as SearchIntentProvider;

    const result = await new SearchIntentService(taxonomy, provider).resolve(
      'mueble de 100 cm',
      'es-BO',
    );

    expect(result.intent).toMatchObject({
      categoryCode: 'DESK',
      measurement: {
        dimension: ProductDimension.WIDTH,
        maxDimensionCm: 100,
      },
      material: { code: 'WOOD' },
    });
    expect(result.interpretation).toMatchObject({
      source: 'ai',
      summary: 'Escritorio · Madera · Máximo 100 cm de ancho',
      category: { code: 'DESK', label: 'Escritorio' },
    });
  });

  it('keeps deterministic search available when the provider fails', async () => {
    const deterministicIntent: SearchIntent = {
      ...deskIntent,
      text: 'escritorio',
    };
    const taxonomy = {
      createSearchIntent: jest.fn().mockResolvedValue(deterministicIntent),
    } as unknown as CategoryTaxonomyService;
    const provider = {
      isAvailable: jest.fn().mockReturnValue(true),
      interpret: jest.fn().mockRejectedValue(new Error('timeout')),
    } as unknown as SearchIntentProvider;

    const result = await new SearchIntentService(taxonomy, provider).resolve(
      'escritorio',
      'es-BO',
    );

    expect(result.intent).toBe(deterministicIntent);
    expect(result.interpretation.source).toBe('deterministic');
    expect(result.interpretation.summary).toBe('Escritorio');
  });
});
