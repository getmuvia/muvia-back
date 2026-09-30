import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import type { Request } from 'express';

/** The API is public in Cloud Run, so these routes verify OIDC themselves. */
@Injectable()
export class EmbeddingTaskAuthGuard implements CanActivate {
  private readonly client = new OAuth2Client();

  constructor(private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    if (
      !this.config.get<boolean>('EMBEDDING_TASKS_ENABLED') ||
      !header?.startsWith('Bearer ')
    ) {
      throw new UnauthorizedException();
    }
    try {
      const ticket = await this.client.verifyIdToken({
        idToken: header.slice(7),
        audience: this.config.getOrThrow<string>('EMBEDDING_TASKS_TARGET_URL'),
      });
      const identity = ticket.getPayload();
      if (
        !identity?.sub ||
        identity.email_verified !== true ||
        identity.email !==
          this.config.getOrThrow<string>('EMBEDDING_TASKS_SERVICE_ACCOUNT')
      ) {
        throw new UnauthorizedException();
      }
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
