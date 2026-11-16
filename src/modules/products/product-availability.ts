import { BadRequestException } from '@nestjs/common';
import { ProductAvailabilityMode } from './enums/product-availability.enum';

export const MAX_PRODUCT_LEAD_TIME_DAYS = 2147483647;

export interface ProductAvailability {
  availabilityMode: ProductAvailabilityMode;
  leadTimeMinDays: number | null;
  leadTimeMaxDays: number | null;
  acceptsCustomDimensions: boolean;
}

/** Validate the effective state, including values retained by a partial update. */
export function resolveProductAvailability(
  changes: Partial<ProductAvailability>,
  current?: Partial<ProductAvailability>,
): ProductAvailability {
  if (
    (changes.availabilityMode !== undefined &&
      !Object.values(ProductAvailabilityMode).includes(
        changes.availabilityMode,
      )) ||
    (changes.acceptsCustomDimensions !== undefined &&
      typeof changes.acceptsCustomDimensions !== 'boolean')
  ) {
    throw new BadRequestException('Invalid product availability');
  }
  const availabilityMode =
    changes.availabilityMode ??
    current?.availabilityMode ??
    ProductAvailabilityMode.IN_STOCK;
  const acceptsCustomDimensions =
    changes.acceptsCustomDimensions ??
    current?.acceptsCustomDimensions ??
    false;
  if (availabilityMode === ProductAvailabilityMode.IN_STOCK) {
    return {
      availabilityMode,
      acceptsCustomDimensions,
      leadTimeMinDays: null,
      leadTimeMaxDays: null,
    };
  }
  const leadTimeMinDays =
    changes.leadTimeMinDays !== undefined
      ? changes.leadTimeMinDays
      : current?.leadTimeMinDays;
  const leadTimeMaxDays =
    changes.leadTimeMaxDays !== undefined
      ? changes.leadTimeMaxDays
      : current?.leadTimeMaxDays;
  if (
    !isPositiveDayCount(leadTimeMinDays) ||
    !isPositiveDayCount(leadTimeMaxDays) ||
    leadTimeMinDays > leadTimeMaxDays
  ) {
    throw new BadRequestException(
      'Made-to-order products require a positive whole-day production range with minimum <= maximum',
    );
  }
  return {
    availabilityMode,
    acceptsCustomDimensions,
    leadTimeMinDays,
    leadTimeMaxDays,
  };
}

function isPositiveDayCount(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= MAX_PRODUCT_LEAD_TIME_DAYS
  );
}
