import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
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
