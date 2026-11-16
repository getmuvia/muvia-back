import type { ProductAvailability } from '../../products/product-availability';

export interface SearchProductCategory {
  id: string;
  code: string;
  name: string;
}

export interface SearchProductResult extends Partial<ProductAvailability> {
  id: string;
  title: string;
  description: string | null;
  keywords: string[];
  price: number;
  stock: number;
  sellerId: string;
  categoryId: string | null;
  categoryCode: string | null;
  category: SearchProductCategory | null;
  specifications: { material?: string } | null;
  currencyCode: string;
  imageUrl: string | null;
  similarity: number;
  createdAt: Date;
}

export interface SearchResult {
  query: string;
  products: SearchProductResult[];
}

export interface HybridProductResult {
  id: string;
  title: string;
  description: string | null;
  price: number;
  currencyCode: string;
  stock: number;
  availabilityMode: ProductAvailability['availabilityMode'];
  leadTimeMinDays: number | null;
  leadTimeMaxDays: number | null;
  acceptsCustomDimensions: boolean;
  category: SearchProductCategory | null;
  imageUrl: string | null;
  score: number;
  matchType: 'semantic' | 'lexical' | 'hybrid';
}

export type SearchInterpretationSource = 'ai' | 'deterministic';
