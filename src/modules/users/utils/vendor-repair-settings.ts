import { BadRequestException } from '@nestjs/common';
import {
  createErrorPayload,
  ERROR_CODES,
} from '../../../common/errors/error-code';

export interface VendorRepairSettings {
  offersRepairs: boolean;
  repairScope: string | null;
  repairDetails: string | null;
  repairsExternalProducts: boolean;
}

export function resolveVendorRepairSettings(
  current: Partial<VendorRepairSettings> | null | undefined,
  patch: Partial<VendorRepairSettings>,
): VendorRepairSettings {
  const offersRepairs = patch.offersRepairs ?? current?.offersRepairs ?? false;
  if (!offersRepairs) {
    return {
      offersRepairs: false,
      repairScope: null,
      repairDetails: null,
      repairsExternalProducts: false,
    };
  }

  const repairScope = (patch.repairScope ?? current?.repairScope ?? '').trim();
  if (!repairScope) {
    throw new BadRequestException(
      createErrorPayload(
        ERROR_CODES.VENDOR_REPAIR_SCOPE_REQUIRED,
        'Repair scope is required when repair services are enabled',
      ),
    );
  }

  return {
    offersRepairs: true,
    repairScope,
    repairDetails:
      (patch.repairDetails ?? current?.repairDetails ?? '').trim() || null,
    repairsExternalProducts:
      patch.repairsExternalProducts ??
      current?.repairsExternalProducts ??
      false,
  };
}
