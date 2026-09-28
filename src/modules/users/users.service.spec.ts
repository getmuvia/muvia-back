import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { Repository } from 'typeorm';
import { PasswordService } from '../../common/services/password.service';
import { MarketsService } from '../markets/markets.service';
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
});
