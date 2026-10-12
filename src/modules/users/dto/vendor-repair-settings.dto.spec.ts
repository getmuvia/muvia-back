import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateVendorProfileDto } from './create-vendor-profile.dto';
import { UpdateVendorProfileDto } from './update-vendor-profile.dto';
import { UpdateUserDto } from './update-user.dto';

describe('Vendor repair DTO validation', () => {
  it.each([
    { offersRepairs: 'true' },
    { offersRepairs: null },
    { repairsExternalProducts: null },
    { repairsExternalProducts: 1 },
    { repairScope: null },
    { repairScope: 'x'.repeat(161) },
    { repairDetails: 'x'.repeat(501) },
  ])('rejects invalid repair fields on creation and update: %j', (fields) => {
    expect(
      validateSync(
        plainToInstance(CreateVendorProfileDto, {
          businessName: 'Store',
          ...fields,
        }),
      ),
    ).not.toHaveLength(0);
    expect(
      validateSync(plainToInstance(UpdateVendorProfileDto, fields)),
    ).not.toHaveLength(0);
  });

  it('leaves omitted repair flags undefined on a partial update', () => {
    const dto = plainToInstance(UpdateVendorProfileDto, {
      businessName: 'New name',
    });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.offersRepairs).toBeUndefined();
    expect(dto.repairsExternalProducts).toBeUndefined();
  });

  it('validates nested repair configuration in PATCH /users/me', () => {
    const dto = plainToInstance(UpdateUserDto, {
      vendorProfile: { offersRepairs: null },
    });
    expect(validateSync(dto)).not.toHaveLength(0);
  });
});
