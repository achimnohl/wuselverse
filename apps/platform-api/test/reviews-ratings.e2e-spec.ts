/**
 * E2E Test for Reviews and Ratings
 * 
 * Tests the review and rating workflow as documented in AGENT_PROVIDER_GUIDE.md:
 * 1. Complete task workflow (agent + task + bid + complete)
 * 2. Submit review
 * 3. View reviews for agent
 * 4. Verify agent reputation updates
 * 
 * Run with: npm run test:e2e
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AuthenticatedSession, createAuthenticatedSession } from './auth-test.utils';
import { AppModule } from '../src/app/app.module';

describe('Reviews and Ratings (e2e)', () => {
  let app: INestApplication;
  let browserSession: AuthenticatedSession;
  let agentApiKey: string;
  let agentId: string;
  let taskId: string;
  let consumerId: string;

  const PLATFORM_PORT = 3100;
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/wuselverse-test-reviews';

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
    console.log(`[Reviews E2E] Platform API started on port ${PLATFORM_PORT}`);

    await new Promise(resolve => setTimeout(resolve, 1000));

    browserSession = await createAuthenticatedSession(app, {
      email: 'reviews.owner@example.com',
      password: 'demodemo123',
      displayName: 'Reviews Owner',
    });
    consumerId = browserSession.user.id;
  }, 30000);

  afterAll(async () => {
    try {
      const connection = app.get('DatabaseConnection');
      if (connection && connection.readyState === 1) {
        await connection.dropDatabase();
        await connection.close();
      }
    } catch (error) {
      console.log('[Reviews E2E] Database cleanup skipped:', error);
    }

    if (app) {
      await app.close();
    }

    console.log('[Reviews E2E] Cleanup complete');
  }, 30000);

  describe('Setup: Complete Task Workflow', () => {
    it('should register an agent', async () => {
      const response = await browserSession.client
        .post('/api/agents')
        .set('x-csrf-token', browserSession.csrfToken)
        .send({
          name: 'Review Test Agent',
          description: 'Agent for testing reviews',
          capabilities: ['code-review'],
        })
        .expect(201);

      agentApiKey = response.body.apiKey || response.body.data?.apiKey;
      agentId = response.body.data._id || response.body.data.id;
    });

    it('should create a task', async () => {
      const response = await browserSession.client
        .post('/api/tasks')
        .set('x-csrf-token', browserSession.csrfToken)
        .send({
          title: 'Test Task for Reviews',
          description: 'Task to test review flow',
          poster: consumerId,
          requirements: {
            capabilities: ['code-review'],
          },
          budget: {
            amount: 200,
            currency: 'USD',
            type: 'fixed',
          },
        })
        .expect(201);

      taskId = response.body.data._id;
      consumerId = response.body.data.poster;
    });

    it('should submit a bid and accept it', async () => {
      // Submit bid
      await request(app.getHttpServer())
        .post(`/api/tasks/${taskId}/bids`)
        .set('Authorization', `Bearer ${agentApiKey}`)
        .send({
          agentId: agentId,
          amount: 180,
          proposal: 'I will review your code thoroughly',
        })
        .expect(201);

      // Get bid ID
      const bidsResponse = await request(app.getHttpServer())
        .get(`/api/tasks/${taskId}/bids`)
        .expect(200);

      const bidId = bidsResponse.body.bids[0].id;

      // Accept bid
      await browserSession.client
        .post(`/api/tasks/${taskId}/assign`)
        .set('x-csrf-token', browserSession.csrfToken)
        .send({ bidId })
        .expect(201);
    });

    it('should complete the task', async () => {
      await request(app.getHttpServer())
        .post(`/api/tasks/${taskId}/complete`)
        .set('Authorization', `Bearer ${agentApiKey}`)
        .send({
          output: {
            message: 'Code review completed',
            findings: ['Issue 1', 'Issue 2'],
          },
        })
        .expect(201);
    });
  });

  describe('Review Submission (AGENT_PROVIDER_GUIDE.md)', () => {
    let reviewId: string;

    it('should allow consumer to review the agent', async () => {
      const response = await browserSession.client
        .post('/api/reviews')
        .set('x-csrf-token', browserSession.csrfToken)
        .send({
          taskId: taskId,
          from: consumerId,
          to: agentId,
          rating: 5,
          comment: 'Excellent work! Very thorough code review with actionable feedback.',
        })
        .expect(201);

      expect(response.body.data).toHaveProperty('_id');
      expect(response.body.data.rating).toBe(5);
      expect(response.body.data.to).toBe(agentId);

      reviewId = response.body.data._id;
      console.log('[Reviews E2E] Review created:', reviewId);
    });

    it('should retrieve reviews for the agent', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/reviews/agent/${agentId}`)
        .expect(200);

      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThan(0);
      
      const review = response.body.data.find((r: any) => r.id === reviewId);
      expect(review).toBeDefined();
      expect(review.rating).toBe(5);
      expect(review.comment).toContain('Excellent work');
    });

    it('should update agent reputation after review', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/agents/${agentId}`)
        .expect(200);

      // Agent should have updated stats
      expect(response.body.data.successCount).toBeGreaterThan(0);
    });
  });

  describe('Rating Validation', () => {
    it('should validate rating range (1-5)', async () => {
      const response = await browserSession.client
        .post('/api/reviews')
        .set('x-csrf-token', browserSession.csrfToken)
        .send({
          taskId: 'different-task-id',
          from: consumerId,
          to: agentId,
          rating: 6, // Invalid rating
          comment: 'Invalid rating test',
        });

      expect(response.status).toBe(400);
    });
  });
});
