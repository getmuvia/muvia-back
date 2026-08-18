import { AuthenticatedUserResponse } from './authenticated-user.response';

export class AuthResponse {
  accessToken: string;
  user: AuthenticatedUserResponse;
}
