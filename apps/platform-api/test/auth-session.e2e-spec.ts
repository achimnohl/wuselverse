import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app/app.module';

describe('Auth Session Flow (e2e)', () => {
  let app: INestApplication;
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/wuselverse-test-auth';
  const PORT = 3110;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = String(PORT);
    process.env.MONGODB_URI = MONGODB_URI;

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

    const cookies = registerResponse.headers['set-cookie'];
    expect(cookies).toBeDefined();

    const meResponse = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookies)
      .expect(200);

    expect(meResponse.body.data.user.displayName).toBe('Demo User');

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', cookies)
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
});
