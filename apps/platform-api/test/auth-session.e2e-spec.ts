import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app/app.module';

describe('Auth Session Flow (e2e)', () => {
  let app: INestApplication;
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/wuselverse-test-auth';
  const PORT = 3110;

  const extractCookieValue = (cookies: string[] | undefined, cookieName: string): string | null => {
    const rawCookie = cookies?.find((value) => value.startsWith(`${cookieName}=`));
    if (!rawCookie) {
      return null;
    }

    return rawCookie.split(';')[0].split('=').slice(1).join('=');
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = String(PORT);
    process.env.MONGODB_URI = MONGODB_URI;
    process.env.REQUIRE_USER_SESSION_FOR_TASK_POSTING = 'true';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', {
      exclude: ['sse', 'messages', 'mcp'],
    });
    app.enableCors({ origin: true, credentials: true });
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: true },
      })
    );

    await app.init();
    await app.listen(PORT);
  }, 30000);

  afterAll(async () => {
    try {
      const connection = app.get('DatabaseConnection');
      if (connection && connection.readyState === 1) {
        await connection.dropDatabase();
        await connection.close();
      }
    } catch {
      // ignore cleanup failures in test shutdown
    }

    if (app) {
      await app.close();
    }
  }, 30000);

  it('registers, authenticates, returns me, and logs out via session cookie', async () => {
    const registerResponse = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'demo.user@example.com',
        password: 'correcthorsebattery',
        displayName: 'Demo User',
      })
      .expect(201);

    expect(registerResponse.body.success).toBe(true);
    expect(registerResponse.body.data.user.email).toBe('demo.user@example.com');

    const cookies = registerResponse.headers['set-cookie'] as unknown as string[];
    const csrfToken = extractCookieValue(cookies, 'wuselverse_csrf');
    expect(cookies).toBeDefined();
    expect(csrfToken).toBeTruthy();
    expect(registerResponse.body.data.csrfToken).toBe(csrfToken);

    const meResponse = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookies)
      .expect(200);

    expect(meResponse.body.data.user.displayName).toBe('Demo User');

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', cookies)
      .set('x-csrf-token', csrfToken as string)
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookies)
      .expect(401);
  });

  it('logs in an existing user and creates a session cookie', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'repeat.user@example.com',
        password: 'repeatablepass',
        displayName: 'Repeat User',
      })
      .expect(201);

    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'repeat.user@example.com',
        password: 'repeatablepass',
      })
      .expect(200);

    expect(loginResponse.body.success).toBe(true);
    expect(loginResponse.headers['set-cookie']).toBeDefined();
  });

  it('reissues a CSRF token for an existing session when the browser only sends the session cookie', async () => {
    const registerResponse = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'refresh.user@example.com',
        password: 'refreshpass123',
        displayName: 'Refresh User',
      })
      .expect(201);

    const cookies = (registerResponse.headers['set-cookie'] ?? []) as unknown as string[];
    const sessionCookie = cookies.find((value) => value.startsWith('wuselverse_session='));
    expect(sessionCookie).toBeTruthy();

    const meResponse = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', [sessionCookie as string])
      .expect(200);

    expect(meResponse.body.data.user.email).toBe('refresh.user@example.com');
    expect(meResponse.body.data.csrfToken).toBeTruthy();
    const refreshedCookies = (meResponse.headers['set-cookie'] ?? []) as unknown as string[];
    expect(refreshedCookies.some((value) => value.startsWith('wuselverse_csrf='))).toBe(true);
  });

  it('rejects session-based task creation without a CSRF token and accepts it with the token', async () => {
    const registerResponse = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'csrf.user@example.com',
        password: 'csrfpass123',
        displayName: 'CSRF User',
      })
      .expect(201);

    const cookies = (registerResponse.headers['set-cookie'] ?? []) as unknown as string[];
    const csrfToken = extractCookieValue(cookies, 'wuselverse_csrf');

    expect(cookies.length).toBeGreaterThan(0);
    expect(csrfToken).toBeTruthy();

    await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Cookie', cookies)
      .send({
        title: 'Protected task without CSRF',
        description: 'This should be rejected because the CSRF header is missing.',
        poster: 'should-be-overridden',
        requirements: { capabilities: ['security-scan'] },
        budget: { amount: 25, currency: 'USD', type: 'fixed' },
      })
      .expect(403);

    const createResponse = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Cookie', cookies)
      .set('x-csrf-token', csrfToken as string)
      .send({
        title: 'Protected task with CSRF',
        description: 'This should succeed because the signed-in browser flow includes the CSRF token.',
        poster: 'should-be-overridden',
        requirements: { capabilities: ['security-scan'] },
        budget: { amount: 25, currency: 'USD', type: 'fixed' },
      })
      .expect(201);

    expect(createResponse.body.success).toBe(true);
    expect(createResponse.body.data.poster).toBe(registerResponse.body.data.user.id);
  });
});
