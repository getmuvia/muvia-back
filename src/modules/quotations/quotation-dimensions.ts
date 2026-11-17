import { BadRequestException } from '@nestjs/common';
import {
  DIMENSION_UNIT_CM,
  QUOTATION_LIMITS,
  type QuotationDimensions,
} from './quotation.constants';

/** Validate both client measurements and the catalog snapshot before persisting. */
export function requireQuotationDimensions(
  value: unknown,
): QuotationDimensions {
  if (!value || typeof value !== 'object')
    throw new BadRequestException('Product dimensions are required');
  const dimensions = value as Record<string, unknown>;
  const unit =
    typeof dimensions.unit === 'string'
      ? dimensions.unit.toLowerCase().trim()
      : '';
  if (!Object.hasOwn(DIMENSION_UNIT_CM, unit))
    throw new BadRequestException('Unsupported dimension unit');
  const factor = DIMENSION_UNIT_CM[unit as keyof typeof DIMENSION_UNIT_CM];
  const measurements = ['width', 'depth', 'height'].map((axis) =>
    Number(dimensions[axis]),
  );
  if (
    measurements.some(
      (n) =>
        !Number.isFinite(n) ||
        n * factor < QUOTATION_LIMITS.minimumDimensionCm ||
        n * factor > QUOTATION_LIMITS.maximumDimensionCm,
    )
  ) {
    throw new BadRequestException('Dimensions are outside the supported range');
  }
  return {
    width: measurements[0],
    depth: measurements[1],
    height: measurements[2],
    unit: unit as QuotationDimensions['unit'],
  };
}

export function sameQuotationDimensions(
  a: QuotationDimensions,
  b: QuotationDimensions,
): boolean {
  return (
    a.unit === b.unit &&
    a.width === b.width &&
    a.depth === b.depth &&
    a.height === b.height
  );
}
