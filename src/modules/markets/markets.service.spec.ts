import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UserRole } from '../../common/enums/user-role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MarketsController } from './markets.controller';
import { UpdateExchangeRateDto } from './dto/update-exchange-rate.dto';

describe('Market exchange-rate administration', () => {
  const handler: unknown = Reflect.get(
    MarketsController.prototype,
    'updateExchangeRate',
  );
  const guard = new RolesGuard(new Reflector());
  const context = (role?: UserRole) =>
    ({
      getHandler: () => handler,
      getClass: () => MarketsController,
      switchToHttp: () => ({
        getRequest: () => ({ user: role ? { role } : undefined }),
      }),
    }) as ExecutionContext;
  it('requires authentication and allows only the admin role to update a rate', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
      JwtAuthGuard,
      RolesGuard,
    ]);
    expect(guard.canActivate(context(UserRole.ADMIN))).toBe(true);
    for (const role of [undefined, UserRole.CONSUMER, UserRole.VENDOR]) {
      expect(guard.canActivate(context(role))).toBe(false);
    }
  });
  it.each([0, -1, Infinity, NaN, '10', 1.1234567, 1_000_001])(
    'rejects invalid rates: %s',
    (rate) => {
      expect(
        validateSync(
          plainToInstance(UpdateExchangeRateDto, { currencyCode: 'USD', rate }),
        ).length,
      ).toBeGreaterThan(0);
    },
  );
  it('accepts a supported ISO currency and a positive rate with up to six decimals', () => {
    const dto = plainToInstance(UpdateExchangeRateDto, {
      currencyCode: ' usd ',
      rate: 11.69,
    });
    expect(dto.currencyCode).toBe('USD');
    expect(validateSync(dto)).toEqual([]);
    expect(
      validateSync(
        plainToInstance(UpdateExchangeRateDto, {
          currencyCode: 'INVALID',
          rate: 1,
        }),
      ).length,
    ).toBeGreaterThan(0);
  });
});
