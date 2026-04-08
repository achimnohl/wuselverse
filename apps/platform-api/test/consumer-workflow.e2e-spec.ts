/**
 * E2E Test for Consumer Workflow
 * 
 * Tests the complete consumer/task poster workflow as documented in CONSUMER_GUIDE.md:
 * 1. Post tasks with different pricing models
 * 2. View tasks
 * 3. View bids from agents
 * 4. Accept bids
 * 5. Track task status
 * 6. Review completed work
 * 
 * Run with: npm run test:e2e
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AuthenticatedSession, createAuthenticatedSession } from './auth-test.utils';
import { AppModule } from '../src/app/app.module';

describe('Consumer Workflow (e2e)', () => {
  let app: INestApplication;
  let browserSession: AuthenticatedSession;
  let taskId: string;
  let agentId: string;
  let agentApiKey: string;
  let bidId: string;
  let consumerId: string;

  const PLATFORM_PORT = 3101;
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/wuselverse-test-consumer';

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
    console.log(`[Consumer E2E] Platform API started on port ${PLATFORM_PORT}`);

    await new Promise(resolve => setTimeout(resolve, 1000));

    browserSession = await createAuthenticatedSession(app, {
      email: 'consumer.workflow@example.com',
      password: 'demodemo123',
      displayName: 'Consumer Workflow User',
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
      console.log('[Consumer E2E] Database cleanup skipped:', error);
    }

    if (app) {
      await app.close();
    }

    console.log('[Consumer E2E] Cleanup complete');
  }, 30000);

  // ============================================
  // 1. Posting Tasks (CONSUMER_GUIDE.md section)
  // ============================================
  
  describe('1. Post Tasks with Different Pricing Models', () => {
    it('should post a fixed-price task', async () => {
      const response = await browserSession.client
        .post('/api/tasks')
        .set('x-csrf-token', browserSession.csrfToken)
        .send({
          title: 'Security audit of Node.js API',
          description: 'Comprehensive security review covering OWASP Top 10',
          poster: consumerId,
          requirements: {
            capabilities: ['security-audit', 'code-review'],
          },
          budget: {
            type: 'fixed',
            amount: 500,
            currency: 'USD',
          },
        })
        .expect(201);

      expect(response.body.data).toHaveProperty('_id');
      expect(response.body.data.title).toBe('Security audit of Node.js API');
      expect(response.body.data.status).toBe('open');
      expect(response.body.data.budget.type).toBe('fixed');
      expect(response.body.data.budget.amount).toBe(500);
      
      taskId = response.body.data._id;
    });

    it('should post an hourly-rate task', async () => {
      const response = await browserSession.client
        .post('/api/tasks')
        .set('x-csrf-token', browserSession.csrfToken)
        .send({
          title: 'Code Review - Ongoing',
          description: 'Weekly code reviews for our team',
          poster: consumerId,
          requirements: {
            capabilities: ['code-review'],
          },
          budget: {
            type: 'hourly',
            amount: 75,
            currency: 'USD',
          },
        })
        .expect(201);

      expect(response.body.data.budget.type).toBe('hourly');
      expect(response.body.data.budget.amount).toBe(75);
    });

    it('should post an outcome-based task', async () => {
      const response = await browserSession.client
        .post('/api/tasks')
        .set('x-csrf-token', browserSession.csrfToken)
        .send({
          title: 'Bug Fix - Critical',
          description: 'Fix production bug ASAP',
          poster: consumerId,
          requirements: {
            capabilities: ['bug-fix', 'debugging'],
          },
          budget: {
            type: 'outcome-based',
            amount: 300,
            currency: 'USD',
          },
        })
        .expect(201);

      expect(response.body.data.budget.type).toBe('outcome-based');
    });
  });

  // ============================================
  // 2. Viewing Tasks (CONSUMER_GUIDE.md section)
  // ============================================

  describe('2. View Tasks', () => {
    it('should list all tasks', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/tasks')
        .expect(200);

      expect(response.body.data.data).toBeInstanceOf(Array);
      expect(response.body.data.data.length).toBeGreaterThanOrEqual(3);
    });

    it('should get specific task by ID', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/tasks/${taskId}`)
        .expect(200);

      expect(response.body.data._id).toBe(taskId);
      expect(response.body.data.title).toBe('Security audit of Node.js API');
    });

    it('should get tasks posted by specific poster', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/tasks/poster/${consumerId}`)
        .expect(200);

      // Response has pagination structure
      expect(response.body.data.data).toBeInstanceOf(Array);
      expect(response.body.data.data.length).toBeGreaterThanOrEqual(3);
      response.body.data.data.forEach((task: any) => {
        expect(task.poster).toBe(consumerId);
      });
    });
  });

  // ============================================
  // 3. Agent Setup for Bidding
  // ============================================

  describe('3. Agent Setup', () => {
    it('should register an agent to bid on tasks', async () => {
      const response = await browserSession.client
        .post('/api/agents')
        .set('x-csrf-token', browserSession.csrfToken)
        .send({
          name: 'Security Pro Agent',
          description: 'Expert in security audits',
          capabilities: ['security-audit', 'code-review'],
          pricing: {
            type: 'fixed',
            amount: 450,
            currency: 'USD',
          },
        })
        .expect(201);

      agentApiKey = response.body.apiKey || response.body.data?.apiKey;
      agentId = response.body.data._id || response.body.data.id;
      expect(agentApiKey).toBeDefined();
    });
  });

  // ============================================
  // 4. Reviewing Bids (CONSUMER_GUIDE.md section)
  // ============================================

  describe('4. Agent Submits Bid and Consumer Reviews', () => {
    it('should allow agent to submit a bid', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/tasks/${taskId}/bids`)
        .set('Authorization', `Bearer ${agentApiKey}`)
        .send({
          agentId: agentId,
          amount: 450,
          proposal: 'I will perform OWASP Top 10 analysis, dependency scan, and deliver detailed report within 24h. I have completed 47 similar audits.',
          estimatedDuration: 86400000, // 24 hours in ms
        })
        .expect(201);

      expect(response.body.data.bids).toBeInstanceOf(Array);
      const bid = response.body.data.bids.find((b: any) => b.agentId === agentId);
      expect(bid).toBeDefined();
      expect(bid.amount).toBe(450);
      bidId = bid.id;
    });

    it('should get bids for the task', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/tasks/${taskId}/bids`)
        .expect(200);

      expect(response.body.bids).toBeInstanceOf(Array);
      expect(response.body.bids.length).toBeGreaterThan(0);
      
      const bid = response.body.bids.find((b: any) => b.id === bidId);
      expect(bid).toBeDefined();
      expect(bid.amount).toBe(450);
      expect(bid.status).toBe('pending');
    });

    it('should view agent details before accepting bid', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/agents/${agentId}`)
        .expect(200);

      expect(response.body.data._id).toBe(agentId);
      expect(response.body.data.name).toBe('Security Pro Agent');
      
      // Capabilities are returned as detailed objects
      expect(response.body.data.capabilities).toBeInstanceOf(Array);
      const hasSecurityAudit = response.body.data.capabilities.some(
        (cap: any) => cap.skill === 'security-audit' || cap === 'security-audit'
      );
      expect(hasSecurityAudit).toBe(true);
    });
  });

  // ============================================
  // 5. Accepting Bids (CONSUMER_GUIDE.md section)
  // ============================================

  describe('5. Accept Bid and Assign Task', () => {
    it('should accept a bid', async () => {
      const response = await browserSession.client
        .post(`/api/tasks/${taskId}/assign`)
        .set('x-csrf-token', browserSession.csrfToken)
        .send({ bidId })
        .expect(201);

      expect(response.body.data.status).toBe('assigned');
      expect(response.body.data.assignedAgent).toBe(agentId);
    });

    it('should verify task status changed to assigned', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/tasks/${taskId}`)
        .expect(200);

      expect(response.body.data.status).toBe('assigned');
      expect(response.body.data.assignedAgent).toBe(agentId);
    });

    it('should create an escrow transaction when the bid is accepted', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/transactions/task/${taskId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);

      const escrowTx = response.body.data.find((tx: any) => tx.type === 'escrow_lock');
      expect(escrowTx).toBeDefined();
      expect(escrowTx.from).toBe(consumerId);
      expect(escrowTx.to).toBe(`escrow:${taskId}`);
      expect(escrowTx.amount).toBe(450);
      expect(escrowTx.status).toBe('completed');
    });
  });

  // ============================================
  // 6. Task Completion (CONSUMER_GUIDE.md section)
  // ============================================

  describe('6. Agent Completes Task', () => {
    it('should allow agent to submit the task for review', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/tasks/${taskId}/complete`)
        .set('Authorization', `Bearer ${agentApiKey}`)
        .send({
          output: {
            findings: [
              'SQL Injection vulnerability in /api/users',
              'Missing rate limiting on authentication endpoints',
              'Outdated dependencies with known CVEs'
            ],
            recommendations: [
              'Use parameterized queries',
              'Implement rate limiting',
              'Update all dependencies'
            ]
          },
          artifacts: ['security-report.json']
        })
        .expect(201);

      expect(response.body.data.status).toBe('pending_review');
    });

    it('should allow the consumer to verify the delivered task', async () => {
      const response = await browserSession.client
        .post(`/api/tasks/${taskId}/verify`)
        .set('x-csrf-token', browserSession.csrfToken)
        .send({ feedback: 'Verified after checking the findings and recommendations.' })
        .expect(201);

      expect(response.body.data.status).toBe('completed');
      expect(response.body.data.verificationStatus).toBe('verified');
    });

    it('should create a payment transaction when the task is verified', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/transactions/task/${taskId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);

      const paymentTx = response.body.data.find((tx: any) => tx.type === 'payment');
      expect(paymentTx).toBeDefined();
      expect(paymentTx.from).toBe(`escrow:${taskId}`);
      expect(paymentTx.to).toBe(agentId);
      expect(paymentTx.amount).toBe(450);
      expect(paymentTx.status).toBe('completed');
    });
  });

  // ============================================
  // 7. Reviewing Work (CONSUMER_GUIDE.md section)
  // ============================================

  describe('7. Consumer Reviews Completed Work', () => {
    it('should allow consumer to submit a review', async () => {
      const response = await browserSession.client
        .post('/api/reviews')
        .set('x-csrf-token', browserSession.csrfToken)
        .send({
          taskId: taskId,
          from: consumerId,
          to: agentId,
          rating: 5,
          comment: 'Excellent security audit. Found 3 critical issues with clear remediation steps. Delivered early.',
        })
        .expect(201);

      expect(response.body.data).toHaveProperty('_id');
      expect(response.body.data.rating).toBe(5);
      expect(response.body.data.to).toBe(agentId);
    });

    it('should retrieve reviews for the agent', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/reviews/agent/${agentId}`)
        .expect(200);

      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThan(0);
      
      const review = response.body.data[0];
      expect(review.to).toBe(agentId);
      expect(review.rating).toBe(5);
    });
  });

  // ============================================
  // 8. List All Agents (Discovery - CONSUMER_GUIDE.md)
  // ============================================

  describe('8. Consumer Discovers Agents', () => {
    it('should list all available agents', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/agents')
        .expect(200);

      expect(response.body.data.data).toBeInstanceOf(Array);
      expect(response.body.data.data.length).toBeGreaterThan(0);
      
      const agent = response.body.data.data.find((a: any) => a._id === agentId);
      expect(agent).toBeDefined();
    });
  });
});
