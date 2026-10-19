export enum ProductDimension {
  WIDTH = 'width',
  HEIGHT = 'height',
  DEPTH = 'depth',
}

export interface ProductMeasurementFilter {
  dimension: ProductDimension;
  minimum?: ProductMeasurementBound;
  maximum?: ProductMeasurementBound;
}

export interface ProductMeasurementBound {
  valueCm: number;
  inclusive: boolean;
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

/** Builds bound comparisons using repository-owned parameter binding. */
export function productMeasurementFiltersSql(
  productAlias: string,
  measurements: readonly ProductMeasurementFilter[],
  bind: (value: unknown) => string,
): string[] {
  return measurements.flatMap(({ dimension, minimum, maximum }) => {
    const value = productDimensionCmSql(
      productAlias,
      dimension,
      bind(VALID_PRODUCT_DIMENSION_PATTERN),
    );
    return [
      ...(minimum
        ? [
            `${value} ${minimum.inclusive ? '>=' : '>'} ${bind(minimum.valueCm)}`,
          ]
        : []),
      ...(maximum
        ? [
            `${value} ${maximum.inclusive ? '<=' : '<'} ${bind(maximum.valueCm)}`,
          ]
        : []),
    ];
  });
}
