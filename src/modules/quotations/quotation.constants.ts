export const QUOTATION_LIMITS = {
  notesLength: 2000,
  minimumDimensionCm: 0.1,
  maximumDimensionCm: 10000,
  maximumPrice: 99999999.99,
  maximumProductionDays: 2147483647,
  defaultPageSize: 20,
  maximumPageSize: 100,
} as const;

export const DIMENSION_UNIT_CM = { cm: 1, m: 100, in: 2.54 } as const;
export type QuotationDimensionUnit = keyof typeof DIMENSION_UNIT_CM;

export enum QuotationStatus {
  PENDING = 'PENDING',
  QUOTED = 'QUOTED',
  DECLINED = 'DECLINED',
}

export type QuotationView = 'sent' | 'received';

export interface QuotationDimensions {
  width: number;
  depth: number;
  height: number;
  unit: QuotationDimensionUnit;
}
