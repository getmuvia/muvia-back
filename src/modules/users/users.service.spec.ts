import 'reflect-metadata';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { Repository } from 'typeorm';
import { PasswordService } from '../../common/services/password.service';
import { MarketsService } from '../markets/markets.service';
import { FilesService } from '../files/files.service';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from './entities/user.entity';
import { VendorLocation } from './entities/vendor-location.entity';
import { VendorProfile } from './entities/vendor-profile.entity';
import { UserRole } from './interfaces/user-role';
import { UsersService } from './users.service';

describe('UsersService.create', () => {
  it('normalizes an admin-created account before lookup and persistence', async () => {
    const userRepository = {
      findOne: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'user-id',
        email: 'buyer@example.com',
        role: UserRole.CONSUMER,
      }),
      create: jest.fn((value: unknown) => value),
      save: jest.fn((value: unknown) => Promise.resolve(value)),
    };
    const passwordService = { hash: jest.fn().mockResolvedValue('hashed') };
    const service = new UsersService(
      userRepository as unknown as Repository<User>,
      {} as Repository<VendorProfile>,
      {} as Repository<VendorLocation>,
      passwordService as unknown as PasswordService,
      {} as MarketsService,
      {} as FilesService,
    );

    await service.create({
      email: '  Buyer@Example.com  ',
      password: 'StrongPassword1!',
      role: UserRole.CONSUMER,
    });

    expect(userRepository.findOne).toHaveBeenNthCalledWith(1, {
      where: { email: 'buyer@example.com' },
    });
    expect(userRepository.create).toHaveBeenCalledWith({
      email: 'buyer@example.com',
      passwordHash: 'hashed',
      role: UserRole.CONSUMER,
    });
  });

  it('normalizes email before DTO validation in the admin route', () => {
    const dto = plainToInstance(CreateUserDto, {
      email: '  Buyer@Example.com  ',
      password: 'StrongPassword1!',
      role: UserRole.CONSUMER,
    });

    expect(dto.email).toBe('buyer@example.com');
  });

  it('rejects a profile logo supplied during registration', async () => {
    const service = new UsersService(
      {
        findOne: jest.fn().mockResolvedValue(null),
      } as unknown as Repository<User>,
      {} as Repository<VendorProfile>,
      {} as Repository<VendorLocation>,
      {} as PasswordService,
      {} as MarketsService,
      {} as FilesService,
    );

    const error = await service
      .create({
        email: 'seller@example.com',
        password: 'StrongPassword1!',
        role: UserRole.VENDOR,
        vendorProfile: {
          businessName: 'Seller',
          logoUrl: 'https://example.com/logo.png',
        },
      })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'PROFILE_IMAGE_REQUIRES_UPLOAD',
      message: 'Profile image must be uploaded after registration',
    });
  });
});

describe('UsersService.update', () => {
  it('rejects an unverified new profile image before saving', async () => {
    const userRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'seller-id',
        role: UserRole.VENDOR,
        vendorProfile: { logoUrl: null },
      }),
      merge: jest.fn(),
      save: jest.fn(),
    };
    const filesService = {
      verifyAssetReference: jest
        .fn()
        .mockRejectedValue(new BadRequestException('invalid')),
    };
    const service = new UsersService(
      userRepository as unknown as Repository<User>,
      {} as Repository<VendorProfile>,
      {} as Repository<VendorLocation>,
      {} as PasswordService,
      {} as MarketsService,
      filesService as unknown as FilesService,
    );

    await expect(
      service.update('seller-id', {
        vendorProfile: {
          logoUrl:
            'https://storage.googleapis.com/assets/users/seller-id/logo.jpg',
        },
      }),
    ).rejects.toThrow(BadRequestException);
    expect(filesService.verifyAssetReference).toHaveBeenCalledWith(
      'seller-id',
      'https://storage.googleapis.com/assets/users/seller-id/logo.jpg',
      'profile_image',
    );
    expect(userRepository.save).not.toHaveBeenCalled();
  });
});

describe('Vendor repair settings and public profiles', () => {
  const currentRepairs = {
    offersRepairs: true,
    repairScope: 'Upholstery',
    repairDetails: 'Assessment before quotation',
    repairsExternalProducts: true,
  };

  function setup(role = UserRole.VENDOR) {
    const user = {
      id: 'seller-id',
      email: 'private@example.com',
      passwordHash: 'secret',
      role,
      createdAt: new Date('2026-10-11'),
      virtualStagingQuotaRemaining: 9,
      vendorProfile: {
        id: 'profile-id',
        userId: 'seller-id',
        businessName: 'Store',
        ...currentRepairs,
        user: { email: 'private@example.com' },
      },
    };
    const userRepository = {
      findOne: jest.fn().mockResolvedValue(user),
      merge: jest.fn((entity: object, patch: object) =>
        Object.assign(entity, patch),
      ),
      save: jest.fn((entity: unknown) => Promise.resolve(entity)),
    };
    const profileRepository = {
      merge: jest.fn((entity: object, patch: object) =>
        Object.assign(entity, patch),
      ),
    };
    const service = new UsersService(
      userRepository as unknown as Repository<User>,
      profileRepository as unknown as Repository<VendorProfile>,
      {
        findOne: jest.fn().mockResolvedValue({}),
        merge: jest.fn(),
        save: jest.fn(),
      } as unknown as Repository<VendorLocation>,
      {} as PasswordService,
      {
        findActive: jest
          .fn()
          .mockResolvedValue([{ code: 'BO', isDefault: true }]),
        requireActive: jest.fn(),
      } as unknown as MarketsService,
      {} as FilesService,
    );
    return { service, user, userRepository, profileRepository };
  }

  it('preserves repairs when updating unrelated profile fields', async () => {
    const { service, user } = setup();
    await service.update(user.id, {
      vendorProfile: { businessName: 'Updated store' },
    });
    expect(user.vendorProfile).toMatchObject(currentRepairs);
  });

  it('merges and trims partial repair changes', async () => {
    const { service, user } = setup();
    await service.update(user.id, {
      vendorProfile: {
        repairScope: '  Wooden frames  ',
        repairDetails: '  ',
        repairsExternalProducts: false,
      },
    });
    expect(user.vendorProfile).toMatchObject({
      offersRepairs: true,
      repairScope: 'Wooden frames',
      repairDetails: null,
      repairsExternalProducts: false,
    });
  });

  it('clears repair data when the service is disabled', async () => {
    const { service, user } = setup();
    await service.update(user.id, { vendorProfile: { offersRepairs: false } });
    expect(user.vendorProfile).toMatchObject({
      offersRepairs: false,
      repairScope: null,
      repairDetails: null,
      repairsExternalProducts: false,
    });
  });

  it('rejects an empty scope before saving an active profile', async () => {
    const { service, user, userRepository } = setup();
    await expect(
      service.update(user.id, { vendorProfile: { repairScope: '   ' } }),
    ).rejects.toThrow(BadRequestException);
    expect(userRepository.save).not.toHaveBeenCalled();
  });

  it('rejects enabling repairs without a scope after they were disabled', async () => {
    const { service, user, userRepository } = setup();
    await service.update(user.id, { vendorProfile: { offersRepairs: false } });
    userRepository.save.mockClear();
    await expect(
      service.update(user.id, { vendorProfile: { offersRepairs: true } }),
    ).rejects.toThrow(BadRequestException);
    expect(userRepository.save).not.toHaveBeenCalled();
  });

  it('rejects a consumer attempting to change vendor settings', async () => {
    const { service, user, userRepository } = setup(UserRole.CONSUMER);
    await expect(
      service.update(user.id, { vendorProfile: { offersRepairs: true } }),
    ).rejects.toThrow(ForbiddenException);
    expect(userRepository.save).not.toHaveBeenCalled();
  });

  it('returns repair settings publicly without private account data', async () => {
    const { service, user } = setup();
    const response = await service.findOnePublic(user.id);
    expect(response.vendorProfile).toMatchObject(currentRepairs);
    expect(response).not.toHaveProperty('email');
    expect(response).not.toHaveProperty('passwordHash');
    expect(response).not.toHaveProperty('virtualStagingQuotaRemaining');
    expect(response.vendorProfile).not.toHaveProperty('user');
    expect(response.vendorProfile).not.toHaveProperty('userId');
  });

  it('does not publish consumer accounts as stores', async () => {
    const { service, user } = setup(UserRole.CONSUMER);
    await expect(service.findOnePublic(user.id)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects invalid registration settings before creating an account', async () => {
    const { service, userRepository } = setup();
    userRepository.findOne.mockResolvedValueOnce(null);
    await expect(
      service.create({
        email: 'new@example.com',
        password: 'StrongPassword1!',
        role: UserRole.VENDOR,
        vendorProfile: { businessName: 'Store', offersRepairs: true },
      }),
    ).rejects.toThrow(BadRequestException);
    expect(userRepository.save).not.toHaveBeenCalled();
  });
});
