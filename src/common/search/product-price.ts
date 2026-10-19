export interface ProductPriceBound {
  amount: number;
  inclusive: boolean;
}

export interface ProductPriceFilter {
  currencyCode: string;
  minimum?: ProductPriceBound;
  maximum?: ProductPriceBound;
}
