export interface ProductSummaryDto {
  id: string;
  title: string;
  price: number;
  currencyCode: string;
  category: { id: string; name: string } | null;
  primaryImage: { url: string; alt: string | null } | null;
}

export interface ProductCatalogPageDto {
  data: ProductSummaryDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
