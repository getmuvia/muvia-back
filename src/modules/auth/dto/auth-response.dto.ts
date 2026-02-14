import { UserRole } from '../../../common/enums/user-role.enum';

export class UserPayload {
    id: string;
    email: string;
    role: UserRole;
}

export class AuthResponseDto {
    accessToken: string;
    user: UserPayload;
}
