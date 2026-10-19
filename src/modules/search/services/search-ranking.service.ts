import { Injectable } from '@nestjs/common';
import {
  containsSearchPhrase,
  matchesSearchTerm,
  normalizeSearchText,
} from '../../../common/search/search-text';
import { Product } from '../../products/entities/product.entity';
import { AssetType } from '../../products/enums/asset-type.enum';
import type { SearchIntent } from '../interfaces/search-intent.interface';
import type {
  HybridProductResult,
  SearchProductResult,
} from '../interfaces/search-result.interface';
import { SEARCH } from '../search.constants';

@Injectable()
export class SearchRankingService {
  rank(
    semantic: SearchProductResult[],
    lexical: Product[],
    intent: SearchIntent,
  ): { results: HybridProductResult[]; relatedResults: HybridProductResult[] } {
    const candidates = new Map<
      string,
      {
        result: HybridProductResult;
        categoryCode?: string | null;
        material?: string;
        text: string;
        similarity?: number;
        lexical: boolean;
      }
    >();
    for (const product of semantic) {
      candidates.set(product.id, {
        result: {
          id: product.id,
          title: product.title,
          description: product.description,
          price: Number(product.price),
          currencyCode: product.currencyCode,
          category: product.category,
          imageUrl: product.imageUrl,
          score: product.similarity,
          matchType: 'semantic',
        },
        categoryCode: product.categoryCode,
        material: product.specifications?.material,
        text: normalizeSearchText(
          [
            product.title,
            ...(product.keywords ?? []),
            product.description,
            product.specifications?.material,
          ].join(' '),
        ),
        similarity: product.similarity,
        lexical: false,
      });
    }
    for (const product of lexical) {
      const existing = candidates.get(product.id);
      if (existing) {
        existing.lexical = true;
        existing.result.matchType =
          existing.similarity === undefined ? 'lexical' : 'hybrid';
        continue;
      }
      const listing = product.listings?.[0];
      const asset =
        product.assets?.find(
          (item) => item.isPrimary && item.type === AssetType.IMAGE,
        ) ?? product.assets?.find((item) => item.type === AssetType.IMAGE);
      candidates.set(product.id, {
        result: {
          id: product.id,
          title: product.title,
          description: product.description,
          price: Number(listing?.price ?? product.price),
          currencyCode:
            listing?.currencyCode ?? intent.price?.currencyCode ?? '',
          category: product.category
            ? {
                id: product.category.id,
                code: product.category.code,
                name: product.category.name,
              }
            : null,
          imageUrl: asset?.url ?? null,
          score: 0,
          matchType: 'lexical',
        },
        categoryCode: product.category?.code,
        material: product.specifications?.material,
        text: normalizeSearchText(
          [
            product.title,
            ...(product.keywords ?? []),
            product.description,
            product.specifications?.material,
          ].join(' '),
        ),
        lexical: true,
      });
    }

    const results: HybridProductResult[] = [];
    const relatedResults: HybridProductResult[] = [];
    for (const candidate of candidates.values()) {
      const literalScore = intent.terms.length
        ? intent.terms.filter((term) => matchesSearchTerm(candidate.text, term))
            .length / intent.terms.length
        : 1;
      const similarity = candidate.similarity;
      candidate.result.score =
        similarity === undefined
          ? literalScore
          : candidate.lexical
            ? literalScore * (1 - SEARCH.SEMANTIC_RANK_WEIGHT) +
              similarity * SEARCH.SEMANTIC_RANK_WEIGHT
            : similarity;
      const sameCategory =
        !intent.categoryCode || candidate.categoryCode === intent.categoryCode;
      const sameMaterial =
        !intent.material ||
        intent.material.aliases.some((alias) =>
          containsSearchPhrase(
            normalizeSearchText(candidate.material ?? ''),
            alias,
          ),
        );
      const matchesProduct =
        !intent.productTerms?.length ||
        intent.productTerms.some((term) =>
          matchesSearchTerm(candidate.text, term),
        );
      const relevant =
        (candidate.lexical && matchesProduct) ||
        (similarity !== undefined &&
          similarity >= SEARCH.SEMANTIC_PRIMARY_THRESHOLD);
      if (sameCategory && sameMaterial && relevant)
        results.push(candidate.result);
      else if (
        candidate.lexical ||
        (similarity !== undefined &&
          similarity >= SEARCH.SEMANTIC_RELATED_THRESHOLD)
      )
        relatedResults.push(candidate.result);
    }
    const order = (a: HybridProductResult, b: HybridProductResult) =>
      b.score - a.score || a.id.localeCompare(b.id);
    return {
      results: results.sort(order),
      relatedResults: relatedResults.sort(order),
    };
  }
}
