import { registerAs } from '@nestjs/config';
import { JwtSignOptions } from '@nestjs/jwt';

export const authConfig = registerAs('auth', () => ({
  jwt: {
    secret: process.env.JWT_SECRET!,
    expiresIn: (process.env.JWT_EXPIRATION ?? '24h') as JwtSignOptions['expiresIn'],
    issuer: process.env.JWT_ISSUER ?? 'muvia-api',
    audience: process.env.JWT_AUDIENCE ?? 'muvia-client',
  },
}));
