import { UserRole } from '../../users/interfaces/user-role';

export class UserPayload {
    id: string;
    email: string;
    role: UserRole;
}

export class AuthResponseDto {
    accessToken: string;
    user: UserPayload;
}
