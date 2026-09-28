import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../../common/enums/user-role.enum';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { EmbeddingController } from './embedding.controller';

describe('EmbeddingController permissions', () => {
  const guard = new RolesGuard(new Reflector());
  const regenerateHandler = Reflect.get(
    EmbeddingController.prototype,
    'regenerate',
  );

  const contextFor = (role?: UserRole): ExecutionContext =>
    ({
      getHandler: () => regenerateHandler,
      getClass: () => EmbeddingController,
      switchToHttp: () => ({
        getRequest: () => ({ user: role ? { role } : undefined }),
      }),
    }) as ExecutionContext;

  it('allows an admin to regenerate catalog embeddings', () => {
    expect(guard.canActivate(contextFor(UserRole.ADMIN))).toBe(true);
  });

  it.each([UserRole.VENDOR, UserRole.CONSUMER])(
    'rejects the %s role',
    (role) => {
      expect(guard.canActivate(contextFor(role))).toBe(false);
    },
  );

  it('rejects requests without an authenticated user', () => {
    expect(guard.canActivate(contextFor())).toBe(false);
  });
});
