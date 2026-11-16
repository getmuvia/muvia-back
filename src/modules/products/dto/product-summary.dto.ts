import type { ProductAvailability } from '../product-availability';

export interface ProductSummaryDto extends ProductAvailability {
  id: string;
  title: string;
  price: number;
  currencyCode: string;
  stock: number;
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
