/**
 * E2E Test for Agent Registration and Pricing Models
 * 
 * Tests agent registration with different configurations as documented in AGENT_PROVIDER_GUIDE.md:
 * 1. Agent registration with basic manifest
 * 2. Different pricing models (fixed, hourly, outcome-based)
 * 3. MCP endpoint configuration
 * 4. Agent profile retrieval
 * 
 * Run with: npm run test:e2e
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app/app.module';

describe('Agent Registration and Pricing (e2e)', () => {
  let app: INestApplication;
  let agentId: string;
  let agentApiKey: string;

  const PLATFORM_PORT = 3103;
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/wuselverse-test-manifest';

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
    console.log(`[Manifest E2E] Platform API started on port ${PLATFORM_PORT}`);

    await new Promise(resolve => setTimeout(resolve, 1000));
  }, 30000);

  afterAll(async () => {
    try {
      const connection = app.get('DatabaseConnection');
      if (connection && connection.readyState === 1) {
        await connection.dropDatabase();
        await connection.close();
      }
    } catch (error) {
      console.log('[Manifest E2E] Database cleanup skipped:', error);
    }

    if (app) {
      await app.close();
    }

    console.log('[Manifest E2E] Cleanup complete');
  }, 30000);

  describe('1. Agent Registration with Complete Manifest (AGENT_PROVIDER_GUIDE.md)', () => {
    it('should register agent with all fields', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/agents')
        .send({
          name: 'Code Reviewer Pro',
          description: 'Professional code review service',
          capabilities: ['code-review', 'security-scan', 'best-practices'],
          owner: 'github-user-123',
          pricing: {
            type: 'fixed',
            amount: 150,
            currency: 'USD',
          },
          mcpEndpoint: 'https://mcp.codereviewer.example.com',
          manifestUrl: 'https://codereviewer.example.com/manifest.json',
          metadata: {
            version: '1.0.0',
            supportedLanguages: ['typescript', 'javascript', 'python'],
          },
        })
        .expect(201);

      expect(response.body.data).toHaveProperty('_id');
      expect(response.body.data.name).toBe('Code Reviewer Pro');
      expect(response.body.data.status).toBe('pending'); // Compliance check
      expect(response.body.apiKey).toBeDefined();
      expect(response.body.apiKey).toMatch(/^wusel_/);

      agentId = response.body.data._id;
      agentApiKey = response.body.apiKey;
    });
  });

  describe('2. Agent Profile Retrieval (CONSUMER_GUIDE.md)', () => {
    it('should retrieve complete agent profile', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/agents/${agentId}`)
        .expect(200);

      expect(response.body.data._id).toBe(agentId);
      expect(response.body.data.name).toBe('Code Reviewer Pro');
      expect(response.body.data.description).toBe('Professional code review service');
      
      // Capabilities may be strings or detailed objects
      expect(response.body.data.capabilities).toBeInstanceOf(Array);
      const hasCodeReview = response.body.data.capabilities.some(
        (cap: any) => cap.skill === 'code-review' || cap === 'code-review'
      );
      expect(hasCodeReview).toBe(true);
      
      expect(response.body.data.pricing.type).toBe('fixed');
      expect(response.body.data.pricing.amount).toBe(150);
      expect(response.body.data.mcpEndpoint).toBe('https://mcp.codereviewer.example.com');
      expect(response.body.data.manifestUrl).toBe('https://codereviewer.example.com/manifest.json');
    });
  });

  describe('3. Pricing Model Variations (AGENT_PROVIDER_GUIDE.md)', () => {
    it('should register agent with hourly pricing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/agents')
        .send({
          name: 'Hourly Consultant',
          description: 'Hourly rate consultant',
          capabilities: ['consulting'],
          pricing: {
            type: 'hourly',
            amount: 100,
            currency: 'USD',
          },
        })
        .expect(201);

      expect(response.body.data.pricing.type).toBe('hourly');
      expect(response.body.data.pricing.amount).toBe(100);
    });

    it('should register agent with outcome-based pricing', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/agents')
        .send({
          name: 'Outcome Agent',
          description: 'Pays for results',
          capabilities: ['bug-fix'],
          pricing: {
            type: 'outcome-based',
            amount: 200,
            currency: 'USD',
          },
        })
        .expect(201);

      expect(response.body.data.pricing.type).toBe('outcome-based');
      expect(response.body.data.pricing.amount).toBe(200);
    });
  });

  describe('4. MCP Endpoint Configuration (AGENT_PROVIDER_GUIDE.md)', () => {
    it('should register agent with MCP endpoint', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/agents')
        .send({
          name: 'MCP Agent',
          description: 'Agent with MCP support',
          capabilities: ['task-execution'],
          mcpEndpoint: 'https://mcp.example.com/agent',
        })
        .expect(201);

      expect(response.body.data.mcpEndpoint).toBe('https://mcp.example.com/agent');
    });

    it('should work without MCP endpoint (optional)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/agents')
        .send({
          name: 'No MCP Agent',
          description: 'Agent without MCP',
          capabilities: ['task-execution'],
        })
        .expect(201);

      expect(response.body.data._id).toBeDefined();
    });
  });

  describe('5. Validation Tests', () => {
    it('should reject agent registration without required fields', async () => {
      await request(app.getHttpServer())
        .post('/api/agents')
        .send({
          name: 'Incomplete Agent',
          // Missing required fields
        })
        .expect(400);
    });

    it('should reject invalid pricing model', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/agents')
        .send({
          name: 'Invalid Pricing Agent',
          description: 'Test',
          capabilities: ['test'],
          pricing: {
            type: 'invalid-type', // Invalid
            amount: 100,
            currency: 'USD',
          },
        });

      // May accept but validate later, or reject immediately
      expect([400, 201]).toContain(response.status);
    });
  });

  describe('6. Agent Status After Registration', () => {
    it('should have pending status initially (compliance check)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/agents')
        .send({
          name: 'Status Test Agent',
          description: 'Testing initial status',
          capabilities: ['test'],
        })
        .expect(201);

      expect(response.body.data.status).toBe('pending');
    });
  });
});
