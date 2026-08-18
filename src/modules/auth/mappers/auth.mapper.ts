import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { AuthResponse } from '../responses/auth.response';
import { AuthenticatedUserResponse } from '../responses/authenticated-user.response';

export class AuthMapper {
  static toJwtPayload(user: AuthenticatedUser): JwtPayload {
    return { sub: user.id };
  }

  static toAuthenticatedUser(user: AuthenticatedUser): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  }

  static toUserResponse(user: AuthenticatedUser): AuthenticatedUserResponse {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  }

  static toAuthResponse(
    accessToken: string,
    user: AuthenticatedUser,
  ): AuthResponse {
    return {
      accessToken,
      user: this.toUserResponse(user),
    };
  }
}
