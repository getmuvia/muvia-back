import { searchTerms } from './search-text';

export enum ProductDimension {
  WIDTH = 'width',
  HEIGHT = 'height',
  DEPTH = 'depth',
}

export interface ProductMeasurementFilter {
  dimension: ProductDimension;
  maxDimensionCm: number;
}

export interface ProductMeasurementSearch {
  query: string;
  measurement?: ProductMeasurementFilter;
}

export const VALID_PRODUCT_DIMENSION_PATTERN = '^\\d+(\\.\\d+)?$';

const DIMENSION_TERMS: Readonly<Record<ProductDimension, readonly string[]>> = {
  [ProductDimension.WIDTH]: ['ancho', 'anchura', 'width', 'wide'],
  [ProductDimension.HEIGHT]: ['alto', 'altura', 'height', 'tall'],
  [ProductDimension.DEPTH]: [
    'largo',
    'longitud',
    'profundidad',
    'fondo',
    'length',
    'depth',
    'long',
  ],
};

const MEASUREMENT_PATTERN_SOURCE = String.raw`(\d+(?:[.,]\d+)?)\s*(milimetros?|millimeters?|mm|centimetros?|centimeters?|cms?|metros?|meters?|pulgadas?|inches?|inch|in|pies?|feet|foot|ft|m)\b`;
const MAXIMUM_PATTERN_SOURCE = String.raw`(?:o\s+menos|como\s+maximo|maximo|max|hasta|no\s+(?:mas|mayor)\s+(?:de|a|que)|menor(?:\s+o\s+igual)?\s+(?:a|que)|que\s+no\s+(?:supere|pase)|que\s+quepa|para\s+caber)`;
const MEASUREMENT_FILLERS = new Set([
  'caber',
  'espacio',
  'medida',
  'medidas',
  'medir',
  'mida',
  'mide',
  'quepa',
  'tamano',
  'tenga',
  'tengan',
  'tener',
]);

export function parseProductMeasurementSearch(
  value: string,
  locale = 'es-BO',
): ProductMeasurementSearch {
  const originalQuery = value.trim().replace(/\s+/g, ' ');
  const normalizedQuery = normalizeMeasurementText(originalQuery);
  const measurementMatch = normalizedQuery.match(
    new RegExp(MEASUREMENT_PATTERN_SOURCE, 'u'),
  );
  const dimensionMatch = findDimension(normalizedQuery);
  const hasMaximumIntent =
    new RegExp(`\\b${MAXIMUM_PATTERN_SOURCE}\\b`, 'u').test(normalizedQuery) ||
    value.includes('<=') ||
    value.includes('≤');

  if (!measurementMatch || !dimensionMatch || !hasMaximumIntent) {
    return { query: originalQuery };
  }

  const maxDimensionCm = convertToCentimeters(
    Number(measurementMatch[1].replace(',', '.')),
    measurementMatch[2],
  );
  if (
    !Number.isFinite(maxDimensionCm) ||
    maxDimensionCm < 1 ||
    maxDimensionCm > 10000
  ) {
    return { query: originalQuery };
  }

  const queryWithoutMeasurement = normalizedQuery
    .replace(new RegExp(MEASUREMENT_PATTERN_SOURCE, 'gu'), ' ')
    .replace(dimensionTermsPattern(), ' ')
    .replace(new RegExp(`\\b${MAXIMUM_PATTERN_SOURCE}\\b`, 'gu'), ' ')
    .replace(/(?:<=|≤)/gu, ' ');
  const query = searchTerms(queryWithoutMeasurement, locale)
    .filter((term) => !MEASUREMENT_FILLERS.has(term))
    .join(' ');

  return {
    query,
    measurement: {
      dimension: dimensionMatch,
      maxDimensionCm: Math.round(maxDimensionCm * 100) / 100,
    },
  };
}

/** Builds a PostgreSQL expression for source-controlled product aliases and dimensions. */
export function productDimensionCmSql(
  productAlias: string,
  dimension: ProductDimension,
  validDimensionPattern: string,
): string {
  const value = `${productAlias}.specifications -> 'dimensions' ->> '${dimension}'`;
  const unit = `LOWER(COALESCE(${productAlias}.specifications -> 'dimensions' ->> 'unit', 'cm'))`;

  return `(CASE
    WHEN (${value}) ~ ${validDimensionPattern} THEN
      CASE ${unit}
        WHEN 'cm' THEN (${value})::numeric
        WHEN 'm' THEN (${value})::numeric * 100
        WHEN 'in' THEN (${value})::numeric * 2.54
        ELSE NULL
      END
    ELSE NULL
  END)`;
}

function normalizeMeasurementText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}.,<≤]+/gu, ' ')
    .trim();
}

function findDimension(value: string): ProductDimension | undefined {
  return (
    Object.entries(DIMENSION_TERMS) as [ProductDimension, readonly string[]][]
  ).find(([, terms]) =>
    terms.some((term) => new RegExp(`\\b${term}\\b`, 'u').test(value)),
  )?.[0];
}

function dimensionTermsPattern(): RegExp {
  const terms = Object.values(DIMENSION_TERMS)
    .flat()
    .sort((a, b) => b.length - a.length);
  return new RegExp(`\\b(?:${terms.join('|')})\\b`, 'gu');
}

function convertToCentimeters(value: number, unit: string): number {
  if (/^(?:milimetros?|millimeters?|mm)$/.test(unit)) return value / 10;
  if (/^(?:metros?|meters?|m)$/.test(unit)) return value * 100;
  if (/^(?:pulgadas?|inches?|inch|in)$/.test(unit)) return value * 2.54;
  if (/^(?:pies?|feet|foot|ft)$/.test(unit)) return value * 30.48;
  return value;
}
