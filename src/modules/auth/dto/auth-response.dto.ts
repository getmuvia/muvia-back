import { UserRole } from '../../users/interfaces/user-role';

export class AuthResponseDto {
    accessToken: string;
    user: {
        id: string;
        email: string;
        role: UserRole;
    };
}
