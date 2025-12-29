import { Global, Module } from '@nestjs/common';
import { PasswordService } from './services/password.service';

@Global()
@Module({
    providers: [PasswordService],
    exports: [PasswordService],
})
export class CommonModule { }
