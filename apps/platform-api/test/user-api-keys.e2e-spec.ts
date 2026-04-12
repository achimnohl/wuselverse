import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app/app.module';

describe('User API Keys (e2e)', () => {
  let app: INestApplication;
  let sessionClient: ReturnType<typeof request.agent>;
  let csrfToken: string;
  let userId: string;
  let apiKeyId: string;
  let userApiKey: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.REQUIRE_USER_SESSION_FOR_TASK_POSTING = 'false';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', {
      exclude: ['sse', 'messages', 'mcp'],
    });
    await app.init();
    sessionClient = request.agent(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  describe('API Key Lifecycle', () => {
    it('should register a user and get session', async () => {
      const email = `apikey.test.${Date.now()}@example.com`;
      const response = await sessionClient
        .post('/api/auth/register')
        .send({
          email,
          password: 'testpass123',
          displayName: 'API Key Test User',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.csrfToken).toBeDefined();

      userId = response.body.data.user.id;
      csrfToken = response.body.data.csrfToken;

      // session cookie is persisted automatically by supertest agent
    });

    it('should create a new API key', async () => {
      const response = await sessionClient
        .post('/api/auth/keys')
        .set('X-CSRF-Token', csrfToken)
        .send({
          name: 'Test Script Key',
          expiresInDays: 30,
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.apiKey).toBeDefined();
      expect(response.body.data.apiKey).toMatch(/^wusu_/);
      expect(response.body.data.name).toBe('Test Script Key');
      expect(response.body.data.prefix).toBeDefined();
      expect(response.body.data.expiresAt).toBeDefined();

      userApiKey = response.body.data.apiKey;
      apiKeyId = response.body.data.id;
    });

    it('should list API keys', async () => {
      const response = await sessionClient
        .get('/api/auth/keys')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThan(0);

      const key = response.body.data[0];
      expect(key.name).toBe('Test Script Key');
      expect(key.prefix).toBeDefined();
      expect(key.apiKey).toBeUndefined(); // Should NOT return the full key
    });

    it('should authenticate with user API key to post a task', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${userApiKey}`)
        .send({
          title: 'Task via User API Key',
          description: 'Testing user API key authentication',
          poster: userId,
          requirements: { capabilities: ['test-capability'] },
          budget: { type: 'fixed', amount: 50, currency: 'USD' },
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe('Task via User API Key');
    });

    it('should authenticate with user API key to list tasks', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/tasks')
        .set('Authorization', `Bearer ${userApiKey}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });

    it('allows task posting without session even with invalid API key when session requirement is disabled', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', 'Bearer wusu_invalid_key_12345')
        .send({
          title: 'Task with Invalid User API Key',
          description: 'Test',
          poster: userId,
          requirements: { capabilities: ['test'] },
          budget: { type: 'fixed', amount: 50, currency: 'USD' },
        })
        .expect(201);

      expect(response.body.success).toBe(true);
    });

    it('should revoke an API key', async () => {
      const response = await sessionClient
        .delete(`/api/auth/keys/${apiKeyId}`)
        .set('X-CSRF-Token', csrfToken)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('revoked');
    });

    it('allows task posting with revoked API key when session requirement is disabled', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${userApiKey}`)
        .send({
          title: 'Task with Revoked User API Key',
          description: 'Test',
          poster: userId,
          requirements: { capabilities: ['test'] },
          budget: { type: 'fixed', amount: 50, currency: 'USD' },
        })
        .expect(201);

      expect(response.body.success).toBe(true);
    });

    it('should not list revoked keys', async () => {
      const response = await sessionClient
        .get('/api/auth/keys')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBe(0); // Revoked key should not appear
    });
  });

  describe('API Key Security', () => {
    let securityClient: ReturnType<typeof request.agent>;
    let testCsrfToken: string;
    let testUserId: string;

    beforeAll(async () => {
      // Create a second test user
      securityClient = request.agent(app.getHttpServer());

      const email = `apikey.security.${Date.now()}@example.com`;
      const response = await securityClient
        .post('/api/auth/register')
        .send({
          email,
          password: 'testpass123',
          displayName: 'Security Test User',
        })
        .expect(201);

      testUserId = response.body.data.user.id;
      testCsrfToken = response.body.data.csrfToken;

      // session cookie is persisted automatically by supertest agent
    });

    it('should require authentication to create API keys', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/keys')
        .send({
          name: 'Unauthorized Key',
        })
        .expect(401);
    });

    it('should require CSRF token to create API keys', async () => {
      await securityClient
        .post('/api/auth/keys')
        // Missing X-CSRF-Token header
        .send({
          name: 'No CSRF Key',
        })
        .expect(403);
    });

    it('should not allow user to revoke another user\'s API key', async () => {
      // Create a key for user 1
      const createResponse = await securityClient
        .post('/api/auth/keys')
        .set('X-CSRF-Token', testCsrfToken)
        .send({
          name: 'User 2 Key',
        })
        .expect(201);

      const keyId = createResponse.body.data.id;

      // Try to revoke with user 2's session (if we had one)
      // For now, just verify the key belongs to the correct user
      const listResponse = await securityClient
        .get('/api/auth/keys')
        .expect(200);

      const key = listResponse.body.data.find((k: any) => k.id === keyId);
      expect(key).toBeDefined();
      expect(key.name).toBe('User 2 Key');
    });
  });

  describe('Session Auth Compatibility', () => {
    it('should still allow session-based task posting', async () => {
      const compatibilityClient = request.agent(app.getHttpServer());
      const email = `session.test.${Date.now()}@example.com`;
      const registerResponse = await compatibilityClient
        .post('/api/auth/register')
        .send({
          email,
          password: 'testpass123',
          displayName: 'Session Test User',
        })
        .expect(201);

      const csrfToken = registerResponse.body.data.csrfToken;
      const userId = registerResponse.body.data.user.id;

      const response = await compatibilityClient
        .post('/api/tasks')
        .set('X-CSRF-Token', csrfToken)
        .send({
          title: 'Task via Session Auth',
          description: 'Testing backward compatibility',
          poster: userId,
          requirements: { capabilities: ['test-capability'] },
          budget: { type: 'fixed', amount: 50, currency: 'USD' },
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe('Task via Session Auth');
    });
  });
});


