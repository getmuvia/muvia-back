import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '../../common/enums/user-role.enum';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

describe('CategoriesController', () => {
  let controller: CategoriesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [{ provide: CategoriesService, useValue: {} }],
    }).compile();

    controller = module.get<CategoriesController>(CategoriesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('allows only admins to create categories', () => {
    const guard = new RolesGuard(new Reflector());
    const createHandler = Reflect.get(CategoriesController.prototype, 'create');
    const contextFor = (role: UserRole): ExecutionContext =>
      ({
        getHandler: () => createHandler,
        getClass: () => CategoriesController,
        switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
      }) as ExecutionContext;

    expect(guard.canActivate(contextFor(UserRole.ADMIN))).toBe(true);
    expect(guard.canActivate(contextFor(UserRole.VENDOR))).toBe(false);
    expect(guard.canActivate(contextFor(UserRole.CONSUMER))).toBe(false);
  });
});
