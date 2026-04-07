import { INestApplication } from '@nestjs/common';
import request from 'supertest';

export interface AuthenticatedSession {
  client: ReturnType<typeof request.agent>;
  user: {
    id: string;
    email: string;
    displayName: string;
    roles?: string[];
  };
  csrfToken: string;
  email: string;
  password: string;
}

function extractCookieValue(cookies: string[] | undefined, cookieName: string): string | null {
  const rawCookie = cookies?.find((value) => value.startsWith(`${cookieName}=`));
  if (!rawCookie) {
    return null;
  }

  return rawCookie.split(';')[0].split('=').slice(1).join('=');
}

export async function createAuthenticatedSession(
  app: INestApplication,
  options: Partial<{ email: string; password: string; displayName: string }> = {}
): Promise<AuthenticatedSession> {
  const client = request.agent(app.getHttpServer());
  const email = options.email ?? `e2e-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
  const password = options.password ?? 'demodemo123';
  const displayName = options.displayName ?? 'E2E User';

  let authResponse = await client.post('/api/auth/register').send({
    email,
    password,
    displayName,
  });

  if (authResponse.status === 409) {
    authResponse = await client.post('/api/auth/login').send({
      email,
      password,
    });
  }

  if (![200, 201].includes(authResponse.status)) {
    throw new Error(
      `Unable to create authenticated session (${authResponse.status}): ${JSON.stringify(authResponse.body)}`
    );
  }

  const cookies = (authResponse.headers['set-cookie'] ?? []) as unknown as string[];
  let csrfToken = authResponse.body?.data?.csrfToken || extractCookieValue(cookies, 'wuselverse_csrf');
  let user = authResponse.body?.data?.user;

  if (!csrfToken || !user) {
    const meResponse = await client.get('/api/auth/me').expect(200);
    const refreshedCookies = (meResponse.headers['set-cookie'] ?? []) as unknown as string[];

    csrfToken = csrfToken || meResponse.body?.data?.csrfToken || extractCookieValue(refreshedCookies, 'wuselverse_csrf');
    user = user || meResponse.body?.data?.user;
  }

  if (!csrfToken || !user?.id) {
    throw new Error('Authenticated session was created but no user or CSRF token was returned.');
  }

  return {
    client,
    user,
    csrfToken,
    email,
    password,
  };
}
