/**
 * Quick E2E Test for Debugging
 * Simple test to check registration payload
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AuthenticatedSession, createAuthenticatedSession } from './auth-test.utils';
import { AppModule } from '../src/app/app.module';

describe('Debug E2E', () => {
  let app: INestApplication;
  let ownerSession: AuthenticatedSession;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3099';
    process.env.MONGODB_URI = 'mongodb://localhost:27017/wuselverse-test-debug';
    process.env.PLATFORM_API_KEY = 'platform_test_key_12345';

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

    ownerSession = await createAuthenticatedSession(app, {
      email: 'debug.owner@example.com',
      password: 'demodemo123',
      displayName: 'Debug Owner',
    });
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  }, 30000);

  it('should register an agent and log response', async () => {
    const response = await ownerSession.client
      .post('/api/agents')
      .set('x-csrf-token', ownerSession.csrfToken)
      .send({
        name: 'Debug Test Agent',
        description: 'Test agent for debugging',
        capabilities: ['test', 'code-review'],
      });

    console.log('Response status:', response.status);
    console.log('Response body:', JSON.stringify(response.body, null, 2));
    
    expect(response.status).toBe(201);
  });
});
