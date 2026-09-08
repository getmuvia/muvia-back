import { SearchLocaleData } from './search-locale.interface';

export const EN_SEARCH_LOCALE: SearchLocaleData = {
  stopWords: new Set([
    'a', 'an', 'and', 'for', 'from', 'i', 'in', 'is', 'my', 'of', 'or', 'the', 'to',
    'want', 'need', 'search', 'find', 'product', 'products', 'with',
  ]),
  articles: ['', 'a ', 'an ', 'the '],
  identityPrefixes: [
    'used as', 'use as', 'works as', 'serves as', 'convertible into', 'converts into',
  ],
};
