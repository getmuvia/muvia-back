import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { CertificateFormat } from 'google-auth-library/build/src/auth/oauth2client';
import { generateKeyPairSync, sign } from 'node:crypto';
import { EmbeddingTaskAuthGuard } from './embedding-task-auth.guard';

describe('EmbeddingTaskAuthGuard with signed OIDC tokens', () => {
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const audience = 'https://muvia-back-test.run.app';
  const email = 'embedding-invoker@muvia-test.iam.gserviceaccount.com';
  let guard: EmbeddingTaskAuthGuard;
  let enabled: boolean;

  function token(overrides: Record<string, unknown> = {}): string {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(
      JSON.stringify({ alg: 'RS256', kid: 'test-key' }),
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        iss: 'https://accounts.google.com',
        aud: audience,
        sub: '1234',
        email,
        email_verified: true,
        iat: now,
        exp: now + 3600,
        ...overrides,
      }),
    ).toString('base64url');
    const content = `${header}.${payload}`;
    return `${content}.${sign('RSA-SHA256', Buffer.from(content), keys.privateKey).toString('base64url')}`;
  }

  function request(authorization?: string): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {
            authorization,
            'x-cloudtasks-taskname': 'forged-task-header',
          },
        }),
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    enabled = true;
    jest
      .spyOn(OAuth2Client.prototype, 'getFederatedSignonCertsAsync')
      .mockResolvedValue({
        certs: {
          'test-key': keys.publicKey
            .export({ type: 'spki', format: 'pem' })
            .toString(),
        },
        format: CertificateFormat.PEM,
      });
    const config = {
      get: () => enabled,
      getOrThrow: (name: string) =>
        name === 'EMBEDDING_TASKS_TARGET_URL' ? audience : email,
    } as unknown as ConfigService;
    guard = new EmbeddingTaskAuthGuard(config);
  });

  afterEach(() => jest.restoreAllMocks());

  it('accepts a valid signature, audience and designated service account', async () => {
    await expect(guard.canActivate(request(`Bearer ${token()}`))).resolves.toBe(
      true,
    );
  });

  it.each([
    { email: 'another@muvia-test.iam.gserviceaccount.com' },
    { email_verified: false },
    { aud: 'https://another.run.app' },
    { iss: 'https://untrusted.example.com' },
    { exp: Math.floor(Date.now() / 1000) - 600 },
  ])('rejects invalid identity or token claims: %j', async (claims) => {
    await expect(
      guard.canActivate(request(`Bearer ${token(claims)}`)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an altered signature', async () => {
    const signed = token().split('.');
    signed[2] = Buffer.alloc(256).toString('base64url');
    await expect(
      guard.canActivate(request(`Bearer ${signed.join('.')}`)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('does not trust Cloud Tasks headers without an authenticated identity', async () => {
    await expect(guard.canActivate(request())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects even a valid token while the integration is disabled', async () => {
    enabled = false;
    await expect(
      guard.canActivate(request(`Bearer ${token()}`)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
