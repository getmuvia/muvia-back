import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  detectMaterialSearchIntent,
  type MaterialSearchIntent,
} from '../../../common/search/product-material';
import { ProductDimension } from '../../../common/search/product-measurement';
import { CategoryTaxonomyService } from '../../categories/category-taxonomy.service';
import type { SearchInterpretationDto } from '../dto/search-response.dto';
import {
  SEARCH_INTENT_PROVIDER,
  type SearchIntentCandidate,
  type SearchIntentProvider,
} from '../interfaces/search-intent-provider.interface';
import type {
  ResolvedSearchIntent,
  SearchIntent,
} from '../interfaces/search-intent.interface';

@Injectable()
export class SearchIntentService {
  private readonly logger = new Logger(SearchIntentService.name);

  constructor(
    private readonly categoryTaxonomyService: CategoryTaxonomyService,
    @Inject(SEARCH_INTENT_PROVIDER)
    private readonly intentProvider: SearchIntentProvider,
  ) {}

  async resolve(query: string, locale: string): Promise<ResolvedSearchIntent> {
    const deterministicIntent =
      await this.categoryTaxonomyService.createSearchIntent(query, locale);
    const candidate = await this.interpretWithFallback(query, locale);
    const intent = candidate
      ? await this.enrichIntent(deterministicIntent, candidate, locale)
      : deterministicIntent;

    return {
      intent,
      interpretation: this.buildInterpretation(
        query,
        intent,
        candidate,
        locale,
      ),
    };
  }

  private async interpretWithFallback(
    query: string,
    locale: string,
  ): Promise<SearchIntentCandidate | undefined> {
    if (!this.intentProvider.isAvailable()) return undefined;

    try {
      return await this.intentProvider.interpret({ query, locale });
    } catch {
      this.logger.warn('AI intent unavailable; deterministic fallback used');
      return undefined;
    }
  }

  private async enrichIntent(
    deterministic: SearchIntent,
    candidate: SearchIntentCandidate,
    locale: string,
  ): Promise<SearchIntent> {
    let intent = deterministic;

    if (candidate.category) {
      const categoryIntent =
        await this.categoryTaxonomyService.createSearchIntent(
          candidate.category,
          locale,
        );
      if (!intent.categoryCode && categoryIntent.categoryCode) {
        intent = {
          ...intent,
          categoryCode: categoryIntent.categoryCode,
          categoryLabel: categoryIntent.categoryLabel,
          aliases: categoryIntent.aliases,
          relatedCategoryCodes: categoryIntent.relatedCategoryCodes,
        };
      }
    }

    const inferredMaterial = candidate.material
      ? detectMaterialSearchIntent(candidate.material)
      : undefined;

    return {
      ...intent,
      material: intent.material ?? inferredMaterial,
      measurement: intent.measurement ?? candidate.measurement,
    };
  }

  private buildInterpretation(
    query: string,
    intent: SearchIntent,
    candidate: SearchIntentCandidate | undefined,
    locale: string,
  ): SearchInterpretationDto {
    const categoryLabel = this.categoryLabel(intent);
    const materialLabel = this.materialLabel(intent.material, candidate);
    const measurement = intent.measurement;
    const parts = [
      categoryLabel,
      materialLabel,
      measurement
        ? this.measurementLabel(
            measurement.dimension,
            measurement.maxDimensionCm,
            locale,
          )
        : undefined,
    ].filter((part): part is string => Boolean(part));

    return {
      summary: parts.length ? parts.join(' · ') : query.trim(),
      source: candidate ? 'ai' : 'deterministic',
      ...(intent.categoryCode && categoryLabel
        ? {
            category: {
              code: intent.categoryCode,
              label: categoryLabel,
            },
          }
        : {}),
      ...(intent.material && materialLabel
        ? {
            material: {
              code: intent.material.code,
              label: materialLabel,
            },
          }
        : {}),
      ...(measurement ? { measurement: { ...measurement } } : {}),
    };
  }

  private categoryLabel(intent: SearchIntent): string | undefined {
    if (!intent.categoryCode) return undefined;
    return this.capitalize(
      intent.categoryLabel || intent.aliases[0] || intent.categoryCode,
    );
  }

  private materialLabel(
    material: MaterialSearchIntent | undefined,
    candidate: SearchIntentCandidate | undefined,
  ): string | undefined {
    if (!material) return undefined;
    const candidateMaterial = candidate?.material
      ? detectMaterialSearchIntent(candidate.material)
      : undefined;
    const label =
      candidateMaterial?.code === material.code
        ? candidate?.material
        : material.aliases[0];
    return label ? this.capitalize(label) : undefined;
  }

  private measurementLabel(
    dimension: ProductDimension,
    maxDimensionCm: number,
    locale: string,
  ): string {
    const isSpanish = locale.toLowerCase().startsWith('es');
    const labels = isSpanish
      ? {
          [ProductDimension.WIDTH]: 'ancho',
          [ProductDimension.HEIGHT]: 'alto',
          [ProductDimension.DEPTH]: 'profundidad',
        }
      : {
          [ProductDimension.WIDTH]: 'width',
          [ProductDimension.HEIGHT]: 'height',
          [ProductDimension.DEPTH]: 'depth',
        };
    return isSpanish
      ? `Máximo ${maxDimensionCm} cm de ${labels[dimension]}`
      : `Maximum ${maxDimensionCm} cm ${labels[dimension]}`;
  }

  private capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
}
