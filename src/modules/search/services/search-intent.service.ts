import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  normalizeSearchText,
  searchTerms,
} from '../../../common/search/search-text';
import type {
  ProductPriceBound,
  ProductPriceFilter,
} from '../../../common/search/product-price';
import {
  createErrorPayload,
  ERROR_CODES,
} from '../../../common/errors/error-code';
import { CategoryTaxonomyService } from '../../categories/category-taxonomy.service';
import type { Market } from '../../markets/entities/market.entity';
import type { HybridSearchDto } from '../dto/hybrid-search.dto';
import {
  SEARCH_INTENT_PROVIDER,
  type SearchIntentProvider,
  type SearchIntentCandidate,
} from '../interfaces/search-intent-provider.interface';
import type {
  ResolvedSearchIntent,
  SearchIntent,
} from '../interfaces/search-intent.interface';

@Injectable()
export class SearchIntentService {
  private readonly logger = new Logger(SearchIntentService.name);

  constructor(
    private readonly taxonomy: CategoryTaxonomyService,
    @Inject(SEARCH_INTENT_PROVIDER)
    private readonly provider: SearchIntentProvider,
  ) {}

  async resolve(
    query: string,
    locale: string,
    market: Market,
    selected: Pick<
      HybridSearchDto,
      'categoryCode' | 'dimension' | 'maxDimensionCm' | 'condition'
    > = {},
  ): Promise<ResolvedSearchIntent> {
    const categories = await this.taxonomy.getSearchCategories(locale);
    if (
      selected.categoryCode &&
      !categories.some((item) => item.code === selected.categoryCode)
    ) {
      throw new BadRequestException(
        createErrorPayload(
          ERROR_CODES.CATEGORY_NOT_SELECTABLE,
          'The selected category is not available',
        ),
      );
    }
    const selectedIntent: Pick<
      SearchIntent,
      'categoryCode' | 'condition' | 'measurements'
    > = {
      ...(selected.categoryCode ? { categoryCode: selected.categoryCode } : {}),
      ...(selected.condition ? { condition: selected.condition } : {}),
      ...(selected.dimension && selected.maxDimensionCm !== undefined
        ? {
            measurements: [
              {
                dimension: selected.dimension,
                maximum: { valueCm: selected.maxDimensionCm, inclusive: true },
              },
            ],
          }
        : {}),
    };
    let candidate: SearchIntentCandidate | undefined;
    if (this.provider.isAvailable()) {
      try {
        candidate = await this.provider.interpret({
          query,
          locale,
          marketCode: market.code,
          currencyCode: market.currencyCode,
          supportedCurrencies: [
            market.currencyCode,
            ...Object.keys(market.exchangeRates ?? {}),
          ],
          categories,
          selected: selectedIntent,
        });
      } catch {
        this.logger.warn(
          'Search interpretation unavailable; continuing with keyword retrieval',
        );
      }
    }
    const intent: SearchIntent = {
      text: (candidate?.cleanQuery ?? query).trim(),
      terms: candidate
        ? [...new Set(candidate.terms.map(normalizeSearchText).filter(Boolean))]
        : searchTerms(query),
      productTerms: candidate
        ? [
            ...new Set(
              candidate.productTerms.map(normalizeSearchText).filter(Boolean),
            ),
          ]
        : undefined,
      categoryCode: selected.categoryCode ?? candidate?.categoryCode,
      material: candidate?.material
        ? {
            label: candidate.material.label,
            aliases: candidate.material.aliases.map(normalizeSearchText),
          }
        : undefined,
      measurements: [
        ...(candidate?.measurements ?? []).filter(
          (measurement) => measurement.dimension !== selected.dimension,
        ),
        ...(selectedIntent.measurements ?? []),
      ],
      condition: selected.condition ?? candidate?.condition,
      price: candidate?.price
        ? this.convertPrice(candidate.price, market)
        : undefined,
    };
    const category = categories.find(
      (item) => item.code === intent.categoryCode,
    );
    return {
      intent,
      interpretation: {
        summary: candidate?.cleanQuery ?? '',
        source: candidate ? 'ai' : 'deterministic',
        ...(category
          ? { category: { code: category.code, label: category.label } }
          : {}),
        ...(intent.material
          ? { material: { label: intent.material.label } }
          : {}),
        ...(intent.measurements?.length
          ? { measurements: intent.measurements }
          : {}),
        ...(intent.price ? { price: intent.price } : {}),
      },
    };
  }

  private convertPrice(
    price: ProductPriceFilter,
    market: Market,
  ): ProductPriceFilter {
    if (price.currencyCode === market.currencyCode) return price;
    const rate = market.exchangeRates?.[price.currencyCode]?.rate;
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
      throw new BadRequestException(
        createErrorPayload(
          ERROR_CODES.SEARCH_PRICE_CURRENCY_MISMATCH,
          'Use a supported currency for the selected market',
        ),
      );
    }
    const convert = (
      bound: ProductPriceBound | undefined,
      minimum: boolean,
    ): ProductPriceBound | undefined => {
      if (!bound) return undefined;
      const scaled =
        BigInt(Math.round(bound.amount * 100)) *
        BigInt(Math.round(rate * 1_000_000));
      const floor = scaled / 1_000_000n;
      const ceil = floor + (scaled % 1_000_000n ? 1n : 0n);
      // Round toward valid stored cent values without weakening strict comparisons.
      const cents = minimum === bound.inclusive ? ceil : floor;
      const amount = Number(cents) / 100;
      if (amount > 99_999_999.99) {
        throw new BadRequestException(
          createErrorPayload(
            ERROR_CODES.SEARCH_PRICE_INVALID,
            'Converted price exceeds the supported range',
          ),
        );
      }
      return { amount, inclusive: bound.inclusive };
    };
    return {
      currencyCode: market.currencyCode,
      ...(price.minimum ? { minimum: convert(price.minimum, true) } : {}),
      ...(price.maximum ? { maximum: convert(price.maximum, false) } : {}),
    };
  }
}
