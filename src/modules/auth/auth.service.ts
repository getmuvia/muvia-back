import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { PasswordService } from '../../common/services/password.service';
import { LoginDto } from './dto/login.dto';
import { User } from '../users/entities/user.entity';
import { RegisterDto } from './dto/register.dto';
import { AuthResponse } from './responses/auth.response';
import { TokenService } from './services/token.service';
import { AuthMapper } from './mappers/auth.mapper';

const DUMMY_PASSWORD_HASH =
  '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  async register(registerDto: RegisterDto): Promise<AuthResponse> {
    const user = await this.usersService.create({
      ...registerDto,
      email: this.normalizeEmail(registerDto.email),
    });

    return this.createAuthResponse(user);
  }

  async login(loginDto: LoginDto): Promise<AuthResponse> {
    const user = await this.validateCredentials(loginDto.email, loginDto.password);
    return this.createAuthResponse(user);
  }

  private async validateCredentials(email: string, password: string): Promise<User> {
    const user = await this.usersService.findOneByEmail(this.normalizeEmail(email));

    if (!user) {
      await this.passwordService.compare(password, DUMMY_PASSWORD_HASH);
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await this.passwordService.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  private async createAuthResponse(user: User): Promise<AuthResponse> {
    const authenticatedUser = AuthMapper.toAuthenticatedUser(user);
    const accessToken = await this.tokenService.generateAccessToken(authenticatedUser);

    return AuthMapper.toAuthResponse(accessToken, authenticatedUser);
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
