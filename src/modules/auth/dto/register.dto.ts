import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsNotEmpty } from 'class-validator';
import { OmitType } from '@nestjs/mapped-types';
import { UserRole } from '../../../common/enums/user-role.enum';
import { CreateUserDto } from '../../users/dto/create-user.dto';

export class RegisterDto extends OmitType(CreateUserDto, ['email', 'role'] as const) {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @IsIn([UserRole.CONSUMER, UserRole.VENDOR], {
    message: 'Role must be either vendor or consumer',
  })
  @IsNotEmpty({ message: 'Role is required' })
  role: UserRole.CONSUMER | UserRole.VENDOR;
}
