/**
 * E2E Test for Agent Discovery
 * 
 * Tests agent discovery as documented in CONSUMER_GUIDE.md and AGENT_PROVIDER_GUIDE.md:
 * 1. Agent registration with different profiles
 * 2. List all agents (GET /api/agents)
 * 3. Get agent by ID (GET /api/agents/:id)
 * 4. Get agent reviews
 * 
 * Run with: npm run test:e2e
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AuthenticatedSession, createAuthenticatedSession } from './auth-test.utils';
import { AppModule } from '../src/app/app.module';

describe('Agent Discovery (e2e)', () => {
  let app: INestApplication;
  let ownerSession: AuthenticatedSession;
  const agents: any[] = [];

  const PLATFORM_PORT = 3102;
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/wuselverse-test-discovery';

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
    console.log(`[Discovery E2E] Platform API started on port ${PLATFORM_PORT}`);

    await new Promise(resolve => setTimeout(resolve, 1000));

    ownerSession = await createAuthenticatedSession(app, {
      email: 'discovery.owner@example.com',
      password: 'demodemo123',
      displayName: 'Discovery Owner',
    });
  }, 30000);

  afterAll(async () => {
    try {
      const connection = app.get('DatabaseConnection');
      if (connection && connection.readyState === 1) {
        await connection.dropDatabase();
        await connection.close();
      }
    } catch (error) {
      console.log('[Discovery E2E] Database cleanup skipped:', error);
    }

    if (app) {
      await app.close();
    }

    console.log('[Discovery E2E] Cleanup complete');
  }, 30000);

  describe('Agent Registration (AGENT_PROVIDER_GUIDE.md)', () => {
    it('should register a security specialist agent', async () => {
      const response = await ownerSession.client
        .post('/api/agents')
        .set('x-csrf-token', ownerSession.csrfToken)
        .send({
          name: 'Security Specialist',
          description: 'Expert in security audits and vulnerability assessment',
          capabilities: ['security-audit', 'penetration-testing', 'vulnerability-scan'],
          pricing: {
            type: 'fixed',
            amount: 500,
            currency: 'USD',
          },
          mcpEndpoint: 'https://security-agent.example.com/mcp',
        })
        .expect(201);

      agents.push({
        id: response.body.data._id,
        name: 'Security Specialist',
        capabilities: ['security-audit', 'penetration-testing', 'vulnerability-scan'],
      });
    });

    it('should register a code review agent', async () => {
      const response = await ownerSession.client
        .post('/api/agents')
        .set('x-csrf-token', ownerSession.csrfToken)
        .send({
          name: 'Code Reviewer Pro',
          description: 'Automated code review and quality checks',
          capabilities: ['code-review', 'static-analysis', 'code-quality'],
          pricing: {
            type: 'hourly',
            amount: 80,
            currency: 'USD',
          },
        })
        .expect(201);

      agents.push({
        id: response.body.data._id,
        name: 'Code Reviewer Pro',
        capabilities: ['code-review', 'static-analysis', 'code-quality'],
      });
    });

    it('should register a testing agent', async () => {
      const response = await ownerSession.client
        .post('/api/agents')
        .set('x-csrf-token', ownerSession.csrfToken)
        .send({
          name: 'Test Automation Bot',
          description: 'Automated test suite generation',
          capabilities: ['testing', 'test-automation', 'jest', 'cypress'],
          pricing: {
            type: 'fixed',
            amount: 200,
            currency: 'USD',
          },
        })
        .expect(201);

      agents.push({
        id: response.body.data._id,
        name: 'Test Automation Bot',
        capabilities: ['testing', 'test-automation', 'jest', 'cypress'],
      });
    });

    it('should register a full-stack developer agent', async () => {
      const response = await ownerSession.client
        .post('/api/agents')
        .set('x-csrf-token', ownerSession.csrfToken)
        .send({
          name: 'Full-Stack Developer',
          description: 'End-to-end feature implementation',
          capabilities: ['code-review', 'typescript', 'react', 'nodejs', 'testing'],
          pricing: {
            type: 'hourly',
            amount: 100,
            currency: 'USD',
          },
        })
        .expect(201);

      agents.push({
        id: response.body.data._id,
        name: 'Full-Stack Developer',
        capabilities: ['code-review', 'typescript', 'react', 'nodejs', 'testing'],
      });
    });

    it('should update the existing agent when the same owner re-registers the same slug', async () => {
      const firstResponse = await ownerSession.client
        .post('/api/agents')
        .set('x-csrf-token', ownerSession.csrfToken)
        .send({
          name: 'Deployment Guardian',
          slug: 'deployment-guardian',
          description: 'Reviews release plans before deployment.',
          capabilities: ['deployment-review', 'release-checklist'],
          pricing: {
            type: 'fixed',
            amount: 250,
            currency: 'USD',
          },
        })
        .expect(201);

      const secondResponse = await ownerSession.client
        .post('/api/agents')
        .set('x-csrf-token', ownerSession.csrfToken)
        .send({
          name: 'Deployment Guardian',
          slug: 'deployment-guardian',
          description: 'Updated release guardian with stronger verification steps.',
          capabilities: ['deployment-review', 'release-checklist', 'verification'],
          pricing: {
            type: 'fixed',
            amount: 300,
            currency: 'USD',
          },
        })
        .expect(201);

      expect(secondResponse.body.data._id).toBe(firstResponse.body.data._id);
      expect(secondResponse.body.data.slug).toBe('deployment-guardian');
      expect(secondResponse.body.data.description).toContain('stronger verification');

      const ownerAgentsResponse = await request(app.getHttpServer())
        .get(`/api/agents?owner=${encodeURIComponent(ownerSession.user.email)}`)
        .expect(200);

      const matchingAgents = ownerAgentsResponse.body.data.data.filter(
        (agent: any) => agent.slug === 'deployment-guardian'
      );

      expect(matchingAgents).toHaveLength(1);
    });
  });

  describe('List All Agents (CONSUMER_GUIDE.md)', () => {
    it('should retrieve all agents', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/agents')
        .expect(200);

      expect(response.body.data.data).toBeInstanceOf(Array);
      expect(response.body.data.data.length).toBeGreaterThanOrEqual(4);
      
      // Verify pagination structure
      expect(response.body.data).toHaveProperty('total');
      expect(response.body.data).toHaveProperty('page');
    });

    it('should support pagination', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/agents?page=1&limit=2')
        .expect(200);

      expect(response.body.data.data).toBeInstanceOf(Array);
      expect(response.body.data.data.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Get Agent by ID (CONSUMER_GUIDE.md)', () => {
    it('should retrieve specific agent by ID', async () => {
      const agentId = agents[0].id;
      
      const response = await request(app.getHttpServer())
        .get(`/api/agents/${agentId}`)
        .expect(200);

      expect(response.body.data._id).toBe(agentId);
      expect(response.body.data.name).toBe('Security Specialist');
      expect(response.body.data.capabilities).toBeDefined();
      expect(response.body.data.pricing).toBeDefined();
    });

    it('should return 404 for non-existent agent', async () => {
      // Use valid ObjectId format
      await request(app.getHttpServer())
        .get('/api/agents/507f1f77bcf86cd799439011')
        .expect(404);
    });
  });

  describe('Agent Profile Contains Expected Fields', () => {
    it('should include all documented fields in agent profile', async () => {
      const agentId = agents[0].id;
      
      const response = await request(app.getHttpServer())
        .get(`/api/agents/${agentId}`)
        .expect(200);

      const agent = response.body.data;
      
      // Required fields from AGENT_PROVIDER_GUIDE.md
      expect(agent).toHaveProperty('_id');
      expect(agent).toHaveProperty('name');
      expect(agent).toHaveProperty('description');
      expect(agent).toHaveProperty('capabilities');
      expect(agent).toHaveProperty('pricing');
      expect(agent).toHaveProperty('status');
      
      // Pricing structure
      expect(agent.pricing).toHaveProperty('type');
      expect(agent.pricing).toHaveProperty('amount');
      expect(agent.pricing).toHaveProperty('currency');
    });
  });

  describe('Agent Reviews (CONSUMER_GUIDE.md)', () => {
    it('should get reviews for an agent (even if empty)', async () => {
      const agentId = agents[0].id;
      
      const response = await request(app.getHttpServer())
        .get(`/api/reviews/agent/${agentId}`)
        .expect(200);

      expect(response.body.data).toBeInstanceOf(Array);
      // May be empty since no tasks completed yet
    });
  });
});
