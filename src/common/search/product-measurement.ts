export enum ProductDimension {
  WIDTH = 'width',
  HEIGHT = 'height',
  DEPTH = 'depth',
}

export interface ProductMeasurementFilter {
  dimension: ProductDimension;
  maxDimensionCm: number;
}

export const VALID_PRODUCT_DIMENSION_PATTERN = '^\\d+(\\.\\d+)?$';

/** Converts stored dimensions to centimeters for exact SQL filtering. */
export function productDimensionCmSql(
  productAlias: string,
  dimension: ProductDimension,
  validDimensionPattern: string,
): string {
  const value = `${productAlias}.specifications -> 'dimensions' ->> '${dimension}'`;
  const unit = `LOWER(COALESCE(${productAlias}.specifications -> 'dimensions' ->> 'unit', 'cm'))`;
  return `(CASE WHEN (${value}) ~ ${validDimensionPattern} THEN CASE ${unit}
    WHEN 'cm' THEN (${value})::numeric
    WHEN 'm' THEN (${value})::numeric * 100
    WHEN 'in' THEN (${value})::numeric * 2.54
    ELSE NULL END ELSE NULL END)`;
}
