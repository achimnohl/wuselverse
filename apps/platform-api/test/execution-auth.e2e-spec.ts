import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AuthenticatedSession, createAuthenticatedSession } from './auth-test.utils';
import { AppModule } from '../src/app/app.module';

describe('Agent Execution Auth Declaration (e2e)', () => {
  let app: INestApplication;
  let ownerSession: AuthenticatedSession;

  const PLATFORM_PORT = 3104;
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/wuselverse-test-execution-auth';

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
      email: 'execution.auth.owner@example.com',
      password: 'demodemo123',
      displayName: 'Execution Auth Owner',
    });
  }, 30000);

  afterAll(async () => {
    try {
      const connection = app.get('DatabaseConnection');
      if (connection && connection.readyState === 1) {
        await connection.dropDatabase();
        await connection.close();
      }
    } catch {
      // Best-effort cleanup in e2e
    }

    if (app) {
      await app.close();
    }
  }, 30000);

  it('stores explicit executionAuth declaration during registration', async () => {
    const response = await ownerSession.client
      .post('/api/agents')
      .set('x-csrf-token', ownerSession.csrfToken)
      .send({
        name: 'Execution Auth Agent',
        description: 'Declares platform token execution auth requirements',
        capabilities: ['task-execution'],
        pricing: {
          type: 'fixed',
          amount: 25,
          currency: 'USD',
        },
        executionAuth: {
          required: true,
          mode: 'platform_token',
          requiredScopes: ['execute:task', 'artifact:upload'],
          tokenTtlSeconds: 600,
          dpopRequired: true,
          discoveryUrl: 'https://example.com/execution-auth',
        },
      })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.executionAuth).toBeDefined();
    expect(response.body.data.executionAuth.required).toBe(true);
    expect(response.body.data.executionAuth.mode).toBe('platform_token');
    expect(response.body.data.executionAuth.requiredScopes).toEqual(['execute:task', 'artifact:upload']);
    expect(response.body.data.executionAuth.tokenTtlSeconds).toBe(600);
    expect(response.body.data.executionAuth.dpopRequired).toBe(true);
  });

  it('applies optional default executionAuth when omitted', async () => {
    const response = await ownerSession.client
      .post('/api/agents')
      .set('x-csrf-token', ownerSession.csrfToken)
      .send({
        name: 'Default Execution Auth Agent',
        description: 'No explicit execution auth declaration',
        capabilities: ['task-execution'],
      })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.executionAuth).toBeDefined();
    expect(response.body.data.executionAuth.required).toBe(false);
    expect(response.body.data.executionAuth.mode).toBe('none');
  });

  it('rejects invalid executionAuth mode', async () => {
    await ownerSession.client
      .post('/api/agents')
      .set('x-csrf-token', ownerSession.csrfToken)
      .send({
        name: 'Invalid Execution Auth Agent',
        description: 'Uses an invalid execution auth mode',
        capabilities: ['task-execution'],
        executionAuth: {
          required: true,
          mode: 'unknown_mode',
        },
      })
      .expect(400);
  });

  it('updates executionAuth via owner agent API key', async () => {
    const registration = await ownerSession.client
      .post('/api/agents')
      .set('x-csrf-token', ownerSession.csrfToken)
      .send({
        name: 'Execution Auth Updatable Agent',
        description: 'Will be updated through owner API key flow',
        capabilities: ['task-execution'],
      })
      .expect(201);

    const agentId = registration.body.data?._id;
    const agentApiKey = registration.body.apiKey;

    expect(agentId).toBeDefined();
    expect(agentApiKey).toMatch(/^wusel_/);

    const updateResponse = await request(app.getHttpServer())
      .put(`/api/agents/${agentId}`)
      .set('Authorization', `Bearer ${agentApiKey}`)
      .send({
        executionAuth: {
          required: true,
          mode: 'mtls',
          tokenTtlSeconds: 900,
        },
      })
      .expect(200);

    expect(updateResponse.body.success).toBe(true);

    const readResponse = await request(app.getHttpServer())
      .get(`/api/agents/${agentId}`)
      .expect(200);

    expect(readResponse.body.data.executionAuth).toBeDefined();
    expect(readResponse.body.data.executionAuth.required).toBe(true);
    expect(readResponse.body.data.executionAuth.mode).toBe('mtls');
    expect(readResponse.body.data.executionAuth.tokenTtlSeconds).toBe(900);
  });
});
