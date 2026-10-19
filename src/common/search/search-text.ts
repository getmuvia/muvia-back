/** Shared normalization for catalog queries and relevance scoring. */
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function searchTerms(value: string): string[] {
  return [
    ...new Set(
      normalizeSearchText(value)
        .split(' ')
        .filter((word) => word.length >= 2),
    ),
  ];
}

export function containsSearchPhrase(text: string, phrase: string): boolean {
  return phrase.length > 0 && ` ${text} `.includes(` ${phrase} `);
}

/** Mirrors lexical retrieval's word-start prefix matching. */
export function matchesSearchTerm(text: string, term: string): boolean {
  return term.length > 0 && ` ${text}`.includes(` ${term}`);
}

export function searchTermPatterns(terms: readonly string[]): string[] {
  return terms.map((term) => '% ' + normalizeSearchText(term) + '%');
}

export function searchPhrasePatterns(phrases: readonly string[]): string[] {
  return phrases.map((phrase) => '% ' + normalizeSearchText(phrase) + ' %');
}

/** PostgreSQL 16 equivalent. Pass only source-controlled SQL expressions here. */
export function normalizedSearchSql(expression: string): string {
  const unaccented = `regexp_replace(lower(normalize(COALESCE(${expression}, ''), NFD)), U&'[\\0300-\\036f]', '', 'g')`;
  return `btrim(regexp_replace(${unaccented}, '[^[:alnum:]]+', ' ', 'g'))`;
}
