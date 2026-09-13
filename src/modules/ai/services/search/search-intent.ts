import {
  containsSearchPhrase,
  normalizeSearchText,
} from '../../../../common/search/search-text';
import type { ProductMeasurementFilter } from '../../../../common/search/product-measurement';

export interface SearchIntent {
  text: string;
  terms: string[];
  categoryCode?: string;
  aliases: string[];
  aliasCategoryCodes: Readonly<Record<string, string>>;
  relatedCategoryCodes: string[];
  articles: readonly string[];
  identityPrefixes: readonly string[];
  measurement?: ProductMeasurementFilter;
}

export interface SearchableProduct {
  title: string;
  description?: string | null;
  keywords?: string[];
  categoryCode?: string | null;
}

function namedCategory(text: string, intent: SearchIntent): string | undefined {
  return Object.entries(intent.aliasCategoryCodes)
    .sort(([a], [b]) => b.length - a.length)
    .find(([alias]) => containsSearchPhrase(text, alias))?.[1];
}

export function evaluateProduct(
  product: SearchableProduct,
  intent: SearchIntent,
) {
  const title = normalizeSearchText(product.title);
  const keywords = normalizeSearchText((product.keywords ?? []).join(' '));
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
    namedCategory(title, intent) ??
    namedCategory(keywords, intent);
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
  const primary = intent.categoryCode
    ? categoryInIdentity || categoryInDescription
    : intent.terms.length === 0
      ? intent.measurement !== undefined
      : titleCoverage >= 0.5 ||
        keywordCoverage >= 0.5 ||
        descriptionCoverage === 1;
  const relatedType =
    !intent.categoryCode ||
    (identityCategory !== undefined &&
      intent.relatedCategoryCodes.includes(identityCategory));

  let score =
    titleCoverage * 0.65 + keywordCoverage * 0.2 + descriptionCoverage * 0.15;
  if (
    intent.terms.length &&
    intent.terms.every((term) => matches(`${identity} ${description}`, term))
  )
    score += 0.2;
  if (containsSearchPhrase(title, intent.text)) score += 0.15;
  if (containsSearchPhrase(description, intent.text)) score += 0.1;
  if (title === intent.text && intent.text) score = 1;

  return { primary, relatedType, score: Math.min(score, 1) };
}
