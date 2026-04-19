import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app/app.module';
import { AuthenticatedSession, createAuthenticatedSession } from './auth-test.utils';

describe('Execution Sessions (e2e)', () => {
  let app: INestApplication;
  let ownerSession: AuthenticatedSession;
  let taskId: string;
  let ownerUserApiKey: string;

  const PLATFORM_PORT = 3105;
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/wuselverse-test-execution-sessions';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = String(PLATFORM_PORT);
    process.env.MONGODB_URI = MONGODB_URI;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', {
      exclude: ['sse', 'messages', 'mcp'],
    });
    app.enableCors();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      })
    );

    await app.init();
    await app.listen(PLATFORM_PORT);

    ownerSession = await createAuthenticatedSession(app, {
      email: 'execution.sessions.owner@example.com',
      password: 'demodemo123',
      displayName: 'Execution Sessions Owner',
    });

    const taskResponse = await ownerSession.client
      .post('/api/tasks')
      .set('x-csrf-token', ownerSession.csrfToken)
      .send({
        title: 'Execution session test task',
        description: 'Used to validate execution session lifecycle.',
        requirements: { capabilities: ['delegated-text-workflow'] },
        budget: { type: 'fixed', amount: 12, currency: 'USD' },
      })
      .expect(201);

    taskId = taskResponse.body?.data?._id;
    expect(taskId).toBeDefined();

    const apiKeyResponse = await ownerSession.client
      .post('/api/auth/keys')
      .set('x-csrf-token', ownerSession.csrfToken)
      .send({
        name: 'Execution Sessions E2E Key',
        expiresInDays: 30,
      })
      .expect(201);

    ownerUserApiKey = apiKeyResponse.body?.data?.apiKey;
    expect(ownerUserApiKey).toMatch(/^wusu_/);
  }, 30000);

  afterAll(async () => {
    try {
      const connection = app.get('DatabaseConnection');
      if (connection && connection.readyState === 1) {
        await connection.dropDatabase();
        await connection.close();
      }
    } catch {
      // best-effort cleanup in e2e
    }

    if (app) {
      await app.close();
    }
  }, 30000);

  it('creates, introspects, and revokes a consumer execution session', async () => {
    const createResponse = await ownerSession.client
      .post('/api/execution/sessions')
      .set('x-csrf-token', ownerSession.csrfToken)
      .send({
        taskId,
        role: 'consumer',
        scopes: ['execute:task', 'status:update'],
        audience: 'provider:mcp-endpoint',
        ttlSeconds: 600,
      })
      .expect(201);

    expect(createResponse.body.success).toBe(true);
    expect(createResponse.body.data.id).toBeDefined();
    expect(createResponse.body.data.token).toMatch(/^est_/);
    expect(createResponse.body.data.role).toBe('consumer');

    const sessionId = createResponse.body.data.id;

    const introspectActive = await ownerSession.client
      .get(`/api/execution/sessions/${sessionId}/introspect`)
      .expect(200);

    expect(introspectActive.body.success).toBe(true);
    expect(introspectActive.body.data.active).toBe(true);
    expect(introspectActive.body.data.status).toBe('active');
    expect(introspectActive.body.data.taskId).toBe(taskId);

    const revokeResponse = await ownerSession.client
      .post(`/api/execution/sessions/${sessionId}/revoke`)
      .set('x-csrf-token', ownerSession.csrfToken)
      .expect(201);

    expect(revokeResponse.body.success).toBe(true);
    expect(revokeResponse.body.data.status).toBe('revoked');

    const introspectRevoked = await ownerSession.client
      .get(`/api/execution/sessions/${sessionId}/introspect`)
      .expect(200);

    expect(introspectRevoked.body.success).toBe(true);
    expect(introspectRevoked.body.data.active).toBe(false);
    expect(introspectRevoked.body.data.status).toBe('revoked');
  });

  it('rejects role mismatch for authenticated consumer principal', async () => {
    await ownerSession.client
      .post('/api/execution/sessions')
      .set('x-csrf-token', ownerSession.csrfToken)
      .send({
        taskId,
        role: 'provider',
      })
      .expect(403);
  });

  it('supports user API key auth as primary programmatic model (no CSRF required)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/execution/sessions')
      .set('Authorization', `Bearer ${ownerUserApiKey}`)
      .send({
        taskId,
        role: 'consumer',
        scopes: ['execute:task'],
        ttlSeconds: 600,
      })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.token).toMatch(/^est_/);
    expect(response.body.data.role).toBe('consumer');
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer())
      .post('/api/execution/sessions')
      .send({
        taskId,
        role: 'consumer',
      })
      .expect(401);
  });

  describe('handshake participant registration', () => {
    let sessionId: string;

    beforeEach(async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/api/execution/sessions')
        .set('Authorization', `Bearer ${ownerUserApiKey}`)
        .send({
          taskId,
          role: 'consumer',
          scopes: ['execute:task'],
          ttlSeconds: 600,
        })
        .expect(201);

      sessionId = createResponse.body.data.id;
    });

    it('registers consumer endpoint and ephemeral key', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/execution/sessions/${sessionId}/participants`)
        .set('Authorization', `Bearer ${ownerUserApiKey}`)
        .send({
          role: 'consumer',
          endpointUrl: 'https://consumer.example.com/mcp',
          ephemeralPublicKey: 'test-public-key-jwk',
          keyAlgorithm: 'ES256',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.role).toBe('consumer');
      expect(response.body.data.endpointUrl).toBe('https://consumer.example.com/mcp');
      expect(response.body.data.hasEphemeralKey).toBe(true);
      expect(response.body.data.keyAlgorithm).toBe('ES256');
      expect(response.body.data.sessionId).toBe(sessionId);
    });

    it('returns registered participant metadata to task participant', async () => {
      // Register first
      await request(app.getHttpServer())
        .post(`/api/execution/sessions/${sessionId}/participants`)
        .set('Authorization', `Bearer ${ownerUserApiKey}`)
        .send({
          role: 'consumer',
          endpointUrl: 'https://consumer.example.com/mcp',
          ephemeralPublicKey: 'my-ecdh-pub-key',
          keyAlgorithm: 'ES256',
        })
        .expect(201);

      // Retrieve it
      const getResponse = await request(app.getHttpServer())
        .get(`/api/execution/sessions/${sessionId}/participants/consumer`)
        .set('Authorization', `Bearer ${ownerUserApiKey}`)
        .expect(200);

      expect(getResponse.body.success).toBe(true);
      expect(getResponse.body.data.role).toBe('consumer');
      expect(getResponse.body.data.endpointUrl).toBe('https://consumer.example.com/mcp');
      expect(getResponse.body.data.ephemeralPublicKey).toBe('my-ecdh-pub-key');
    });

    it('rejects role mismatch on participant registration', async () => {
      // ownerUserApiKey is the task poster = consumer; trying to register as provider should fail
      await request(app.getHttpServer())
        .post(`/api/execution/sessions/${sessionId}/participants`)
        .set('Authorization', `Bearer ${ownerUserApiKey}`)
        .send({
          role: 'provider',
          endpointUrl: 'https://provider.example.com/mcp',
        })
        .expect(403);
    });

    it('returns 404 when participant not yet registered', async () => {
      await request(app.getHttpServer())
        .get(`/api/execution/sessions/${sessionId}/participants/provider`)
        .set('Authorization', `Bearer ${ownerUserApiKey}`)
        .expect(404);
    });

    it('upserts on repeated registration (updates endpointUrl)', async () => {
      await request(app.getHttpServer())
        .post(`/api/execution/sessions/${sessionId}/participants`)
        .set('Authorization', `Bearer ${ownerUserApiKey}`)
        .send({ role: 'consumer', endpointUrl: 'https://first.example.com/mcp' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/execution/sessions/${sessionId}/participants`)
        .set('Authorization', `Bearer ${ownerUserApiKey}`)
        .send({ role: 'consumer', endpointUrl: 'https://updated.example.com/mcp' })
        .expect(201);

      const getResponse = await request(app.getHttpServer())
        .get(`/api/execution/sessions/${sessionId}/participants/consumer`)
        .set('Authorization', `Bearer ${ownerUserApiKey}`)
        .expect(200);

      expect(getResponse.body.data.endpointUrl).toBe('https://updated.example.com/mcp');
    });
  });
});
