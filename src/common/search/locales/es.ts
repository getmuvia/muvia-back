import { SearchLocaleData } from './search-locale.interface';

export const ES_SEARCH_LOCALE: SearchLocaleData = {
  stopWords: new Set([
    'a', 'al', 'algo', 'con', 'de', 'del', 'el', 'en', 'es', 'la', 'las', 'lo', 'los',
    'mi', 'muy', 'o', 'para', 'por', 'que', 'se', 'su', 'un', 'una', 'unos', 'unas',
    'y', 'busco', 'buscar', 'quiero', 'necesito', 'producto', 'productos',
  ]),
  articles: ['', 'un ', 'una ', 'el ', 'la '],
  identityPrefixes: [
    'utilizarse como', 'usarse como', 'usar como', 'funciona como', 'sirve como',
    'convertible en', 'se convierte en',
  ],
};
