import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PasswordService } from '../../common/services/password.service';
import { ERROR_CODES } from '../../common/errors/error-code';
import { UserRole } from '../../common/enums/user-role.enum';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { TokenService } from './services/token.service';

describe('AuthService registration', () => {
  const registerDto = {
    email: '  Buyer@Example.com  ',
    password: 'StrongPassword1!',
    role: UserRole.CONSUMER,
  } as RegisterDto;

  function createService(registrationEnabled: boolean) {
    const user = {
      id: 'user-id',
      email: 'buyer@example.com',
      role: UserRole.CONSUMER,
    } as User;
    const usersService = { create: jest.fn().mockResolvedValue(user) };
    const tokenService = {
      generateAccessToken: jest.fn().mockResolvedValue('access-token'),
    };
    const configService = {
      get: jest.fn().mockReturnValue(registrationEnabled),
    };
    const service = new AuthService(
      usersService as unknown as UsersService,
      {} as PasswordService,
      tokenService as unknown as TokenService,
      configService as unknown as ConfigService,
    );

    return { service, usersService, tokenService, configService };
  }

  it('rejects public registration before creating a user when closed', async () => {
    const { service, usersService, tokenService, configService } =
      createService(false);

    await expect(service.register(registerDto)).rejects.toMatchObject({
      response: { code: ERROR_CODES.REGISTRATION_CLOSED },
    } as Partial<ForbiddenException>);
    expect(configService.get).toHaveBeenCalledWith(
      'PUBLIC_REGISTRATION_ENABLED',
      false,
    );
    expect(usersService.create).not.toHaveBeenCalled();
    expect(tokenService.generateAccessToken).not.toHaveBeenCalled();
  });

  it('registers and logs in a new user when explicitly enabled', async () => {
    const { service, usersService } = createService(true);

    await expect(service.register(registerDto)).resolves.toEqual({
      accessToken: 'access-token',
      user: {
        id: 'user-id',
        email: 'buyer@example.com',
        role: UserRole.CONSUMER,
      },
    });
    expect(usersService.create).toHaveBeenCalledWith({
      ...registerDto,
      email: 'buyer@example.com',
    });
  });
});
