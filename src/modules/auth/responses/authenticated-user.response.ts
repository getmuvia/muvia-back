import { UserRole } from '../../../common/enums/user-role.enum';

export class AuthenticatedUserResponse {
  id: string;
  email: string;
  role: UserRole;
}
