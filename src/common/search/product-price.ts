export interface ProductPriceBound {
  amount: number;
  inclusive: boolean;
}

export interface ProductPriceFilter {
  currencyCode: string;
  minimum?: ProductPriceBound;
  maximum?: ProductPriceBound;
}

/** Builds price constraints with source-controlled columns and repository-owned binding. */
export function productPriceFiltersSql(
  price: ProductPriceFilter | undefined,
  columns: { currency: string; amount: string },
  bind: (value: unknown) => string,
): string[] {
  if (!price) return [];
  const { currencyCode, minimum, maximum } = price;
  const filters = [`${columns.currency} = ${bind(currencyCode)}`];
  if (minimum)
    filters.push(
      `${columns.amount} ${minimum.inclusive ? '>=' : '>'} ${bind(minimum.amount.toFixed(2))}`,
    );
  if (maximum)
    filters.push(
      `${columns.amount} ${maximum.inclusive ? '<=' : '<'} ${bind(maximum.amount.toFixed(2))}`,
    );
  return filters;
}
