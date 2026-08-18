import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { AuthMapper } from '../mappers/auth.mapper';

@Injectable()
export class TokenService {
  constructor(private readonly jwtService: JwtService) {}

  generateAccessToken(user: AuthenticatedUser): Promise<string> {
    return this.jwtService.signAsync(AuthMapper.toJwtPayload(user));
  }
}
