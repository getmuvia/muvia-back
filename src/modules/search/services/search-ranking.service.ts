import { Injectable } from '@nestjs/common';
import {
  classifyMaterialMatch,
  type MaterialMatchLevel,
} from '../../../common/search/product-material';
import {
  containsSearchPhrase,
  normalizeSearchText,
} from '../../../common/search/search-text';
import { Product } from '../../products/entities/product.entity';
import { AssetType } from '../../products/enums/asset-type.enum';
import type {
  SearchableProduct,
  SearchIntent,
} from '../interfaces/search-intent.interface';
import type {
  HybridProductResult,
  SearchProductResult,
} from '../interfaces/search-result.interface';
import { SEARCH } from '../search.constants';

interface RankedHybridProduct {
  result: HybridProductResult;
  priority: number;
}

interface ProductRelevance {
  primary: boolean;
  fallback: boolean;
  relatedType: boolean;
  materialMatch: MaterialMatchLevel;
  score: number;
}

@Injectable()
export class SearchRankingService {
  rank(
    semantic: SearchProductResult[],
    lexical: Product[],
    intent: SearchIntent,
  ): { results: HybridProductResult[]; relatedResults: HybridProductResult[] } {
    const candidates = this.collectCandidates(semantic, lexical);
    const results: RankedHybridProduct[] = [];
    const relatedResults: RankedHybridProduct[] = [];

    for (const { product, result, similarity } of candidates.values()) {
      const relevance = this.evaluateProduct(product, intent);
      result.score =
        similarity === undefined
          ? relevance.score
          : relevance.score * (1 - SEARCH.SEMANTIC_RANK_WEIGHT) +
            similarity * SEARCH.SEMANTIC_RANK_WEIGHT;

      if (relevance.primary) {
        results.push({
          result,
          priority: this.materialRank(relevance.materialMatch),
        });
      } else if (relevance.fallback) {
        relatedResults.push({ result, priority: 1 });
      } else if (
        relevance.relatedType &&
        similarity !== undefined &&
        similarity >= SEARCH.RELATED_SIMILARITY_THRESHOLD
      ) {
        relatedResults.push({ result, priority: 0 });
      }
    }

    const rank = (a: RankedHybridProduct, b: RankedHybridProduct) =>
      b.priority - a.priority ||
      b.result.score - a.result.score ||
      a.result.title.localeCompare(b.result.title, 'es') ||
      a.result.id.localeCompare(b.result.id);

    return {
      results: results.sort(rank).map(({ result }) => result),
      relatedResults: relatedResults.sort(rank).map(({ result }) => result),
    };
  }

  private collectCandidates(
    semantic: SearchProductResult[],
    lexical: Product[],
  ): Map<
    string,
    {
      product: SearchableProduct;
      result: HybridProductResult;
      similarity?: number;
    }
  > {
    const candidates = new Map<
      string,
      {
        product: SearchableProduct;
        result: HybridProductResult;
        similarity?: number;
      }
    >();

    for (const product of semantic) {
      candidates.set(product.id, {
        product,
        similarity: product.similarity,
        result: {
          id: product.id,
          title: product.title,
          description: product.description,
          price: Number(product.price),
          currencyCode: product.currencyCode,
          imageUrl: product.imageUrl,
          score: product.similarity,
          matchType: 'semantic',
        },
      });
    }

    for (const product of lexical) {
      const existing = candidates.get(product.id);
      if (existing) {
        existing.product = product;
        existing.result.matchType = 'hybrid';
        continue;
      }

      const primaryAsset =
        product.assets?.find(
          (asset) => asset.isPrimary && asset.type === AssetType.IMAGE,
        ) ?? product.assets?.find((asset) => asset.type === AssetType.IMAGE);
      const listing = product.listings?.[0];
      candidates.set(product.id, {
        product: { ...product, categoryCode: product.category?.code },
        result: {
          id: product.id,
          title: product.title,
          description: product.description,
          price: Number(listing?.price ?? product.price),
          currencyCode: listing?.currencyCode ?? 'BOB',
          imageUrl: primaryAsset?.url ?? null,
          score: 0,
          matchType: 'lexical',
        },
      });
    }

    return candidates;
  }

  private evaluateProduct(
    product: SearchableProduct,
    intent: SearchIntent,
  ): ProductRelevance {
    const title = normalizeSearchText(product.title);
    const structuredMaterial = product.specifications?.material ?? '';
    const keywords = normalizeSearchText(
      [...(product.keywords ?? []), structuredMaterial].join(' '),
    );
    const description = normalizeSearchText(product.description ?? '');
    const matches = (text: string, term: string) =>
      containsSearchPhrase(text, term) ||
      (!intent.categoryCode &&
        intent.terms.length === 1 &&
        term.length >= 3 &&
        text.split(' ').some((word) => word.startsWith(term))) ||
      (intent.aliases.includes(term) &&
        intent.aliases.some((alias) => containsSearchPhrase(text, alias)));
    const coverage = (text: string) =>
      intent.terms.filter((term) => matches(text, term)).length /
      intent.terms.length;
    const titleCoverage = intent.terms.length ? coverage(title) : 0;
    const keywordCoverage = intent.terms.length ? coverage(keywords) : 0;
    const descriptionCoverage = intent.terms.length ? coverage(description) : 0;
    const identity = `${title} ${keywords}`;
    const identityCategory =
      product.categoryCode ??
      this.namedCategory(title, intent) ??
      this.namedCategory(keywords, intent);
    const categoryInIdentity =
      intent.categoryCode !== undefined &&
      identityCategory === intent.categoryCode;
    const categoryInDescription = intent.aliases.some((alias) => {
      const start = description.replace(/^(?:un|una|el|la|a|an|the) /, '');
      return (
        (identityCategory === undefined &&
          start.split(' ').slice(0, 3).includes(alias)) ||
        intent.identityPrefixes.some((prefix) =>
          intent.articles.some((article) =>
            containsSearchPhrase(description, `${prefix} ${article}${alias}`),
          ),
        )
      );
    });
    const identityMatches = intent.categoryCode
      ? categoryInIdentity || categoryInDescription
      : intent.terms.length === 0
        ? intent.measurement !== undefined
        : titleCoverage >= 0.5 ||
          keywordCoverage >= 0.5 ||
          descriptionCoverage === 1;
    const materialMatch = classifyMaterialMatch(
      structuredMaterial,
      `${title} ${keywords} ${description}`,
      intent.material,
    );
    const primary =
      identityMatches && (!intent.material || materialMatch !== 'none');
    const fallback = Boolean(
      identityMatches && intent.material && materialMatch === 'none',
    );
    const relatedType =
      !fallback &&
      (!intent.categoryCode ||
        (identityCategory !== undefined &&
          intent.relatedCategoryCodes.includes(identityCategory)));

    let score =
      titleCoverage * 0.65 + keywordCoverage * 0.2 + descriptionCoverage * 0.15;
    if (
      intent.terms.length &&
      intent.terms.every((term) => matches(`${identity} ${description}`, term))
    ) {
      score += 0.2;
    }
    if (containsSearchPhrase(title, intent.text)) score += 0.15;
    if (containsSearchPhrase(description, intent.text)) score += 0.1;
    if (title === intent.text && intent.text) score = 1;

    return {
      primary,
      fallback,
      relatedType,
      materialMatch,
      score: Math.min(score, 1),
    };
  }

  private namedCategory(
    text: string,
    intent: SearchIntent,
  ): string | undefined {
    return Object.entries(intent.aliasCategoryCodes)
      .sort(([a], [b]) => b.length - a.length)
      .find(([alias]) => containsSearchPhrase(text, alias))?.[1];
  }

  private materialRank(level: MaterialMatchLevel): number {
    if (level === 'full') return 2;
    if (level === 'partial') return 1;
    return 0;
  }
}
