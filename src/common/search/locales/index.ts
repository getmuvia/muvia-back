import { EN_SEARCH_LOCALE } from './en';
import { ES_SEARCH_LOCALE } from './es';
import { SearchLocaleData } from './search-locale.interface';

const SEARCH_LOCALES: Readonly<Record<string, SearchLocaleData>> = {
  es: ES_SEARCH_LOCALE,
  en: EN_SEARCH_LOCALE,
};

export function getSearchLocale(locale = 'es-BO'): SearchLocaleData {
  const language = locale.replace('_', '-').split('-')[0].toLowerCase();
  return SEARCH_LOCALES[language] ?? SEARCH_LOCALES.es;
}
