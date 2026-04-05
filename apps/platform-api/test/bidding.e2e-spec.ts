/**
 * E2E Test for Agent Bidding Flow
 * 
 * This test verifies the complete bidding workflow:
 * 1. Platform API starts up
 * 2. Test agent registers with platform
 * 3. Platform creates a task
 * 4. Platform requests bids from registered agents
 * 5. Agent evaluates and submits bid
 * 6. Platform records and retrieves bids
 * 
 * Run with: npm run test:e2e
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import request from 'supertest';
import * as mongoose from 'mongoose';
import { TestAgent } from './test-agent';
import { AppModule } from '../src/app/app.module';

describe('Agent Bidding Flow (e2e)', () => {
  let app: INestApplication;
  let testAgent: TestAgent;
  let agentApiKey: string;
  let agentId: string;
  let adminApiKey: string;
  let taskId: string;

  // Configuration
  const PLATFORM_PORT = 3099;
  const AGENT_MCP_PORT = 3098;
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/wuselverse-test';
  const PLATFORM_API_KEY = process.env.PLATFORM_API_KEY || 'platform_test_key_12345';

  beforeAll(async () => {
    // Load test environment
    process.env.NODE_ENV = 'test';
    process.env.PORT = String(PLATFORM_PORT);
    process.env.MONGODB_URI = MONGODB_URI;
    process.env.PLATFORM_API_KEY = PLATFORM_API_KEY;

    // Create NestJS application
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    
    // Apply same configuration as main.ts
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
    console.log(`[E2E] Platform API started on port ${PLATFORM_PORT}`);

    // Wait for MongoDB connection
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create test agent
    testAgent = new TestAgent({
      name: 'E2E Test Agent',
      capabilities: ['code-review', 'testing'],
      mcpPort: AGENT_MCP_PORT,
      platformUrl: `http://localhost:${PLATFORM_PORT}`,
      platformApiKey: PLATFORM_API_KEY,
      bidAmount: 150,
      shouldBid: true,
    });

    // Start agent's HTTP server
    await testAgent.startHttpServer();
    console.log(`[E2E] Test agent HTTP server started on port ${AGENT_MCP_PORT}`);

    // Wait for servers to be ready
    await new Promise(resolve => setTimeout(resolve, 500));
  }, 30000);

  afterAll(async () => {
    // Stop test agent
    if (testAgent) {
      await testAgent.stopHttpServer();
    }

    // Clear test database - get connection from app
    try {
      const connection = app.get('DatabaseConnection');
      if (connection && connection.readyState === 1) {
        await connection.dropDatabase();
        await connection.close();
      }
    } catch (error) {
      console.log('[E2E] Database cleanup skipped:', error);
    }

    // Close NestJS application
    if (app) {
      await app.close();
    }

    console.log('[E2E] Cleanup complete');
  }, 30000);

  describe('Agent Registration', () => {
    it('should register a new agent and receive API key', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/agents')
        .send({
          name: 'E2E Test Agent',
          description: 'Test agent for e2e testing',
          capabilities: ['code-review', 'testing'],
          mcpEndpoint: `http://localhost:${AGENT_MCP_PORT}`,
        });

      if (response.status !== 201) {
        console.log('[E2E] Registration failed. Status:', response.status);
        console.log('[E2E] Response body:', JSON.stringify(response.body, null, 2));
      }
      
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('apiKey');
      expect(response.body.apiKey).toMatch(/^wusel_[a-z0-9]{32}$/);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data.name).toBe('E2E Test Agent');

      // Store API key and agent ID for subsequent tests
      agentApiKey = response.body.apiKey;
      agentId = response.body.data._id || response.body.data.id;
      console.log('[E2E] Agent registered with API key:', agentApiKey);
      console.log('[E2E] Agent ID:', agentId);
    });

    it('should retrieve registered agent', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/agents')
        .expect(200);

      expect(response.body.data.data).toBeInstanceOf(Array);
      expect(response.body.data.data.length).toBeGreaterThan(0);
      
      const agent = response.body.data.data.find((a: any) => a.name === 'E2E Test Agent');
      expect(agent).toBeDefined();
    });
  });

  describe('Task Creation', () => {
    it('should create a new task', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/tasks')
        .send({
          title: 'E2E Test Task - Code Review',
          description: 'Review code for security vulnerabilities',
          poster: 'test-user',
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

      expect(response.body.data).toHaveProperty('_id');
      expect(response.body.data.title).toBe('E2E Test Task - Code Review');
      expect(response.body.data.status).toBe('open');
      expect(response.body.data.budget.amount).toBe(200);

      taskId = response.body.data._id;
      console.log('[E2E] Task created with ID:', taskId);
    });

    it('should retrieve the created task', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/tasks/${taskId}`)
        .expect(200);

      expect(response.body.data._id).toBe(taskId);
      expect(response.body.data.title).toBe('E2E Test Task - Code Review');
    });
  });

  describe('Bidding Flow', () => {
    it('should request bids from the agent via MCP', async () => {
      // This test verifies that the platform can call the agent's MCP endpoint
      // In a real implementation, this would be triggered automatically when a task is created
      
      // For now, we'll manually test the MCP communication
      const mcpRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'request_bid',
          arguments: {
            taskId: taskId,
            title: 'E2E Test Task - Code Review',
            description: 'Review code for security vulnerabilities',
            requirements: {
              skills: ['code-review'],
              estimatedDuration: 3600,
            },
            budget: 200,
          },
        },
      };

      const response = await fetch(`http://localhost:${AGENT_MCP_PORT}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Platform-API-Key': PLATFORM_API_KEY,
        },
        body: JSON.stringify(mcpRequest),
      });

      expect(response.ok).toBe(true);
      const data = await response.json() as any;
      
      expect(data).toHaveProperty('result');
      expect(Array.isArray(data.result.content)).toBe(true);
      expect(data.result.content[0].type).toBe('text');
      
      const bidResponse = JSON.parse(data.result.content[0].text);
      expect(bidResponse.interested).toBe(true);
      expect(bidResponse.proposedAmount).toBe(150);
      expect(bidResponse.estimatedDuration).toBe(3600);

      console.log('[E2E] Bid response from agent:', bidResponse);
    }, 10000);

    it('should submit a bid using agent API key', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/tasks/${taskId}/bids`)
        .set('Authorization', `Bearer ${agentApiKey}`)
        .send({
          agentId: agentId,
          amount: 150,
          proposal: 'I can review your code for security issues and best practices',
        })
        .expect(201);

      expect(response.body.data).toBeDefined();
      expect(response.body.data.bids).toBeInstanceOf(Array);
      expect(response.body.data.bids.length).toBeGreaterThan(0);

      console.log('[E2E] Bid submitted successfully');
    });

    it('should retrieve bids for the task', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/tasks/${taskId}/bids`)
        .expect(200);

      expect(response.body.bids).toBeInstanceOf(Array);
      expect(response.body.bids.length).toBeGreaterThan(0);
      
      const bid = response.body.bids[0];
      expect(bid.amount).toBe(150);
      expect(bid.status).toBe('pending');
      expect(bid.agentId).toBeDefined();
    });
  });

  describe('Task Assignment', () => {
    let bidId: string;

    it('should get bids for task assignment', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/tasks/${taskId}/bids`)
        .expect(200);

      expect(response.body.bids.length).toBeGreaterThan(0);
      bidId = response.body.bids[0].id;
    });

    it('should assign task to the agent with winning bid', async () => {
      // In production, this would require admin authentication
      const response = await request(app.getHttpServer())
        .post(`/api/tasks/${taskId}/assign`)
        .send({
          bidId: bidId,
        })
        .expect(201);

      expect(response.body.data.status).toBe('assigned');
      expect(response.body.data.assignedAgent).toBeDefined();

      console.log('[E2E] Task assigned to agent');
    });

    it('should retrieve updated task status', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/tasks/${taskId}`)
        .expect(200);

      expect(response.body.data.status).toBe('assigned');
      expect(response.body.data.assignedAgent).toBeDefined();
    });
  });

  describe('Task Completion', () => {
    it('should complete the task', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/tasks/${taskId}/complete`)
        .set('Authorization', `Bearer ${agentApiKey}`)
        .send({
          output: {
            message: 'Code review completed successfully',
            findings: [],
          },
          artifacts: [],
        })
        .expect(201);

      expect(response.body.data.status).toBe('completed');
      expect(response.body.data.completedAt).toBeDefined();

      console.log('[E2E] Task completed successfully');
    });

    it('should verify task completion', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/tasks/${taskId}`)
        .expect(200);

      expect(response.body.data.status).toBe('completed');
      expect(response.body.data.completedAt).toBeDefined();
    });
  });

  describe('Agent Authentication', () => {
    it('should reject requests without API key', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/tasks/${taskId}/bids`)
        .send({
          agentId: agentId,  // Valid agentId but no auth header
          amount: 100,
          proposal: 'Unauthorized bid',
        });
      
      // Should get 401 Unauthorized (not 500)
      expect([401, 403]).toContain(response.status);
    });

    it('should reject requests with invalid API key', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/tasks/${taskId}/bids`)
        .set('Authorization', 'Bearer invalid_key')
        .send({
          agentId: agentId,
          amount: 100,
          proposal: 'Unauthorized bid',
        });
      
      // Should get 401 or 403 Unauthorized (not 500)
      expect([401, 403]).toContain(response.status);
    });

    it('should reject MCP requests without platform API key', async () => {
      const mcpRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'request_bid',
          arguments: {
            taskId: 'test-task',
            title: 'Test',
            description: 'Test',
            requirements: {},
            budget: 100,
          },
        },
      };

      const response = await fetch(`http://localhost:${AGENT_MCP_PORT}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // No X-Platform-API-Key header
        },
        body: JSON.stringify(mcpRequest),
      });

      expect(response.status).toBe(403);
    });

    it('should reject MCP requests with invalid platform API key', async () => {
      const mcpRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'request_bid',
          arguments: {
            taskId: 'test-task',
            title: 'Test',
            description: 'Test',
            requirements: {},
            budget: 100,
          },
        },
      };

      const response = await fetch(`http://localhost:${AGENT_MCP_PORT}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Platform-API-Key': 'invalid_platform_key',
        },
        body: JSON.stringify(mcpRequest),
      });

      expect(response.status).toBe(403);
    });
  });
});
