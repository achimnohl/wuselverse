/**
 * E2E Test for Chat Endpoint Agent Workflow
 * 
 * Tests the complete chat endpoint agent lifecycle:
 * 1. Register chat endpoint agent with auto-bidding
 * 2. Verify auto-bidding triggers for matching tasks
 * 3. Execute task via chat endpoint
 * 4. Verify credential encryption/decryption
 * 5. Error handling for failed chat endpoints
 * 
 * Run with: npm run test:e2e
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import express from 'express';
import { Server } from 'http';
import { AuthenticatedSession, createAuthenticatedSession } from './auth-test.utils';
import { AppModule } from '../src/app/app.module';

describe('Chat Endpoint Agent Workflow (e2e)', () => {
  let app: INestApplication;
  let browserSession: AuthenticatedSession;
  let mockChatServer: Server;
  let mockChatApp: express.Application;
  let agentId: string;
  let agentApiKey: string;
  let taskId: string;
  let bidId: string;
  let receivedRequests: any[] = [];

  const PLATFORM_PORT = 3110;
  const CHAT_AGENT_PORT = 3111;
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/wuselverse-test-chat';
  const CHAT_ENDPOINT_URL = `http://127.0.0.1:${CHAT_AGENT_PORT}/v1/chat/completions`;
  const TEST_API_KEY = 'test-api-key-12345';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = String(PLATFORM_PORT);
    process.env.MONGODB_URI = MONGODB_URI;

    // Create mock chat endpoint server
    mockChatApp = express();
    mockChatApp.use(express.json());

    // Mock OpenAI-compatible endpoint
    mockChatApp.post('/v1/chat/completions', (req, res) => {
      receivedRequests.push({
        headers: req.headers,
        body: req.body,
        timestamp: new Date(),
      });

      const { messages, model } = req.body;

      // Verify authentication
      const authHeader = req.headers.authorization;
      if (authHeader !== `Bearer ${TEST_API_KEY}`) {
        return res.status(401).json({
          error: {
            message: 'Invalid authentication',
            type: 'invalid_auth',
          },
        });
      }

      // Return OpenAI-compatible response
      res.json({
        id: 'chatcmpl-test-123',
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model || 'test-model',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: `Task completed successfully. I analyzed the request: "${messages[messages.length - 1]?.content || 'No content'}" and generated this response.`,
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 30,
          total_tokens: 80,
        },
      });
    });

    // Health check endpoint
    mockChatApp.get('/health', (req, res) => {
      res.json({ status: 'healthy' });
    });

    // Start mock chat server
    await new Promise<void>((resolve) => {
      mockChatServer = mockChatApp.listen(CHAT_AGENT_PORT, '127.0.0.1', () => {
        console.log(`[Chat E2E] Mock chat server started on port ${CHAT_AGENT_PORT}`);
        resolve();
      });
    });

    // Verify mock server is accessible
    try {
      const healthCheck = await fetch(`http://127.0.0.1:${CHAT_AGENT_PORT}/health`);
      const health = await healthCheck.json();
      console.log(`[Chat E2E] Mock server health check passed:`, health);
    } catch (error) {
      console.error(`[Chat E2E] Mock server health check failed:`, error);
      throw new Error('Mock chat server not accessible');
    }

    // Create NestJS application
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
    console.log(`[Chat E2E] Platform API started on port ${PLATFORM_PORT}`);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    browserSession = await createAuthenticatedSession(app, {
      email: 'chat.agent@example.com',
      password: 'demodemo123',
      displayName: 'Chat Agent Owner',
    });
  }, 30000);

  afterAll(async () => {
    // Stop mock chat server
    if (mockChatServer) {
      await new Promise<void>((resolve) => {
        mockChatServer.close(() => {
          console.log('[Chat E2E] Mock chat server stopped');
          resolve();
        });
      });
    }

    // Clear test database
    try {
      const connection = app.get('DatabaseConnection');
      if (connection && connection.readyState === 1) {
        await connection.dropDatabase();
        await connection.close();
      }
    } catch (error) {
      console.log('[Chat E2E] Database cleanup skipped:', error);
    }

    if (app) {
      await app.close();
    }

    console.log('[Chat E2E] Cleanup complete');
  }, 30000);

  // ============================================
  // 1. Register Chat Endpoint Agent
  // ============================================

  describe('1. Register Chat Endpoint Agent', () => {
    it('should register agent with chat endpoint and auto-bidding', async () => {
      const response = await browserSession.client
        .post('/api/agents')
        .set('x-csrf-token', browserSession.csrfToken)
        .send({
          name: 'AI Chat Assistant',
          description: 'General-purpose AI assistant powered by chat API',
          capabilities: ['text-generation', 'question-answering', 'code-explanation'],
          pricing: {
            type: 'fixed',
            amount: 10,
            currency: 'USD',
          },
          chatEndpoint: {
            url: CHAT_ENDPOINT_URL,
            authType: 'bearer',
            credentials: TEST_API_KEY,
            model: 'test-gpt-4',
            systemPrompt: 'You are a helpful AI assistant.',
            parameters: {
              temperature: 0.7,
              max_tokens: 1000,
            },
          },
          autoBidding: {
            enabled: true,
            matchCapabilities: ['text-generation', 'question-answering'],
            minBudget: 5,
            maxBudget: 100,
          },
        });

      if (response.status !== 201) {
        console.log('[Chat E2E] Registration failed:', response.body);
      }

      expect(response.status).toBe(201);
      expect(response.body.data).toHaveProperty('_id');
      expect(response.body.data.name).toBe('AI Chat Assistant');
      expect(response.body.data.chatEndpoint).toBeDefined();
      expect(response.body.data.chatEndpoint.url).toBe(CHAT_ENDPOINT_URL);
      expect(response.body.data.chatEndpoint.authType).toBe('bearer');
      expect(response.body.data.chatEndpoint.model).toBe('test-gpt-4');
      
      // Credentials should be encrypted and not returned
      expect(response.body.data.chatEndpoint.credentials).toBeUndefined();
      // Note: credentialsEncrypted may be returned but should not contain sensitive data
      if (response.body.data.chatEndpoint.credentialsEncrypted) {
        expect(response.body.data.chatEndpoint.credentialsEncrypted).not.toBe(TEST_API_KEY);
      }

      // Auto-bidding config should be present
      expect(response.body.data.autoBidding).toBeDefined();
      expect(response.body.data.autoBidding.enabled).toBe(true);
      expect(response.body.data.autoBidding.matchCapabilities).toContain('text-generation');

      agentId = response.body.data._id;
      agentApiKey = response.body.apiKey;
      console.log('[Chat E2E] Agent registered:', agentId);
    });

    it('should register agent with no auth', async () => {
      const response = await browserSession.client
        .post('/api/agents')
        .set('x-csrf-token', browserSession.csrfToken)
        .send({
          name: 'Open Chat API',
          description: 'Public chat endpoint with no authentication',
          capabilities: ['summarization'],
          pricing: {
            type: 'fixed',
            amount: 5,
            currency: 'USD',
          },
          chatEndpoint: {
            url: CHAT_ENDPOINT_URL,
            authType: 'none',
            model: 'test-model',
          },
        })
        .expect(201);

      expect(response.body.data.chatEndpoint.authType).toBe('none');
      expect(response.body.data.chatEndpoint.credentials).toBeUndefined();
    });

    it('should reject invalid chat endpoint URL', async () => {
      const response = await browserSession.client
        .post('/api/agents')
        .set('x-csrf-token', browserSession.csrfToken)
        .send({
          name: 'Invalid URL Agent',
          description: 'Agent with invalid URL',
          capabilities: ['testing'],
          pricing: {
            type: 'fixed',
            amount: 10,
            currency: 'USD',
          },
          chatEndpoint: {
            url: 'not-a-valid-url',
            authType: 'none',
          },
        });

      expect(response.status).toBe(400);
    });
  });

  // ============================================
  // 2. Auto-Bidding Workflow
  // ============================================

  describe('2. Auto-Bidding for Chat Endpoint Agents', () => {
    it('should auto-bid on matching task', async () => {
      // Post a task with matching capability
      const taskResponse = await browserSession.client
        .post('/api/tasks')
        .set('x-csrf-token', browserSession.csrfToken)
        .send({
          title: 'Generate blog post about AI',
          description: 'Write a 500-word blog post about AI trends',
          requirements: {
            capabilities: ['text-generation'],
          },
          budget: {
            type: 'fixed',
            amount: 20,
            currency: 'USD',
          },
        })
        .expect(201);

      taskId = taskResponse.body.data._id;
      console.log('[Chat E2E] Task created:', taskId);

      // Wait for auto-bidding to process
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Check if bid was automatically created
      const bidsResponse = await request(app.getHttpServer())
        .get(`/api/tasks/${taskId}/bids`)
        .expect(200);

      expect(bidsResponse.body.bids).toBeDefined();
      expect(bidsResponse.body.bids.length).toBeGreaterThan(0);

      const autoBid = bidsResponse.body.bids.find((bid: any) => bid.agentId === agentId);
      expect(autoBid).toBeDefined();
      expect(autoBid.amount).toBe(10); // Agent's pricing
      expect(autoBid.status).toBe('pending');

      bidId = autoBid.id;
      console.log('[Chat E2E] Auto-bid created:', bidId);
    });

    it('should not auto-bid on non-matching task', async () => {
      const taskResponse = await browserSession.client
        .post('/api/tasks')
        .set('x-csrf-token', browserSession.csrfToken)
        .send({
          title: 'Deploy Kubernetes cluster',
          description: 'Set up production K8s infrastructure',
          requirements: {
            capabilities: ['devops', 'kubernetes'],
          },
          budget: {
            type: 'fixed',
            amount: 200,
            currency: 'USD',
          },
        })
        .expect(201);

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const bidsResponse = await request(app.getHttpServer())
        .get(`/api/tasks/${taskResponse.body.data._id}/bids`)
        .expect(200);

      const agentBid = bidsResponse.body.bids.find((bid: any) => bid.agentId === agentId);
      expect(agentBid).toBeUndefined(); // No bid should exist
    });
  });

  // ============================================
  // 3. Task Execution via Chat Endpoint
  // ============================================

  describe('3. Execute Task via Chat Endpoint', () => {
    it('should accept bid and execute task via chat endpoint', async () => {
      receivedRequests = []; // Clear previous requests

      // Accept the bid
      const acceptResponse = await browserSession.client
        .post(`/api/tasks/${taskId}/assign`)
        .set('x-csrf-token', browserSession.csrfToken)
        .send({ bidId })
        .expect(201);

      expect(acceptResponse.body.data.status).toBe('assigned');

      // Wait for task execution
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Verify chat endpoint was called
      expect(receivedRequests.length).toBeGreaterThan(0);
      const chatRequest = receivedRequests[receivedRequests.length - 1];
      
      expect(chatRequest.headers.authorization).toBe(`Bearer ${TEST_API_KEY}`);
      expect(chatRequest.body.messages).toBeDefined();
      expect(chatRequest.body.model).toBe('test-gpt-4');
      expect(chatRequest.body.temperature).toBe(0.7);

      // Check task was completed (awaiting verification)
      const taskResponse = await browserSession.client
        .get(`/api/tasks/${taskId}`)
        .set('x-csrf-token', browserSession.csrfToken)
        .expect(200);

      expect(taskResponse.body.data.status).toBe('pending_review');
      expect(taskResponse.body.data.outcome).toBeDefined();
      expect(taskResponse.body.data.outcome.success).toBe(true);
      expect(taskResponse.body.data.outcome.verificationStatus).toBe('unverified');
      expect(taskResponse.body.data.outcome.result).toHaveProperty('summary');
      expect(taskResponse.body.data.outcome.result.summary).toContain('Task completed successfully');
    });

    it('should handle chat endpoint errors gracefully', async () => {
      // Create agent with invalid endpoint
      const agentResponse = await browserSession.client
        .post('/api/agents')
        .set('x-csrf-token', browserSession.csrfToken)
        .send({
          name: 'Broken Chat Agent',
          description: 'Agent with non-existent endpoint',
          capabilities: ['testing-error'],
          pricing: {
            type: 'fixed',
            amount: 10,
            currency: 'USD',
          },
          chatEndpoint: {
            url: 'http://localhost:9999/nonexistent',
            authType: 'none',
          },
          autoBidding: {
            enabled: true,
            matchCapabilities: ['testing-error'],
          },
        })
        .expect(201);

      const brokenAgentId = agentResponse.body.data._id;

      // Create task and manually create bid
      const taskResponse = await browserSession.client
        .post('/api/tasks')
        .set('x-csrf-token', browserSession.csrfToken)
        .send({
          title: 'Test error handling',
          description: 'This task will fail',
          requirements: {
            capabilities: ['testing-error'],
          },
          budget: {
            type: 'fixed',
            amount: 10,
            currency: 'USD',
          },
        })
        .expect(201);

      const errorTaskId = taskResponse.body.data._id;

      // Wait for auto-bidding to process
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Get bids
      const bidsResponse = await request(app.getHttpServer())
        .get(`/api/tasks/${errorTaskId}/bids`)
        .expect(200);

      const errorBid = bidsResponse.body.bids.find((bid: any) => bid.agentId === brokenAgentId);
      expect(errorBid).toBeDefined();

      // Accept bid
      await browserSession.client
        .post(`/api/tasks/${errorTaskId}/assign`)
        .set('x-csrf-token', browserSession.csrfToken)
        .send({ bidId: errorBid.id })
        .expect(201);

      // Wait for execution attempt
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Task should be marked as failed
      const finalTaskResponse = await browserSession.client
        .get(`/api/tasks/${errorTaskId}`)
        .set('x-csrf-token', browserSession.csrfToken)
        .expect(200);

      expect(finalTaskResponse.body.data.status).toBe('failed');
    });
  });

  // ============================================
  // 4. Credential Security
  // ============================================

  describe('4. Credential Encryption and Security', () => {
    it('should not expose credentials in API responses', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/agents/${agentId}`)
        .expect(200);

      expect(response.body.data.chatEndpoint).toBeDefined();
      expect(response.body.data.chatEndpoint.credentials).toBeUndefined();
      // credentialsEncrypted may be present but should not be the actual key
      if (response.body.data.chatEndpoint.credentialsEncrypted) {
        expect(response.body.data.chatEndpoint.credentialsEncrypted).not.toBe(TEST_API_KEY);
      }
    });

    it('should not expose credentials in agent list', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/agents')
        .expect(200);

      const chatAgent = response.body.data.data.find((a: any) => a._id === agentId);
      expect(chatAgent).toBeDefined();
      expect(chatAgent.chatEndpoint.credentials).toBeUndefined();
      // credentialsEncrypted may be present but should not be the actual key
      if (chatAgent.chatEndpoint.credentialsEncrypted) {
        expect(chatAgent.chatEndpoint.credentialsEncrypted).not.toBe(TEST_API_KEY);
      }
    });
  });

  // ============================================
  // 5. Update Chat Endpoint Configuration
  // ============================================

  describe('5. Update Chat Endpoint Configuration', () => {
    it('should update chat endpoint settings', async () => {
      const response = await request(app.getHttpServer())
        .put(`/api/agents/${agentId}`)
        .set('Authorization', `Bearer ${agentApiKey}`)
        .send({
          chatEndpoint: {
            url: CHAT_ENDPOINT_URL,
            authType: 'bearer',
            credentials: 'new-api-key-67890',
            model: 'updated-model',
            systemPrompt: 'Updated system prompt',
            parameters: {
              temperature: 0.5,
              max_tokens: 2000,
            },
          },
        })
        .expect(200);

      expect(response.body.data.chatEndpoint.model).toBe('updated-model');
      expect(response.body.data.chatEndpoint.systemPrompt).toBe('Updated system prompt');
      expect(response.body.data.chatEndpoint.credentials).toBeUndefined();
    });

    it('should update auto-bidding configuration', async () => {
      const response = await request(app.getHttpServer())
        .put(`/api/agents/${agentId}`)
        .set('Authorization', `Bearer ${agentApiKey}`)
        .send({
          autoBidding: {
            enabled: false,
            matchCapabilities: ['text-generation'],
          },
        })
        .expect(200);

      expect(response.body.data.autoBidding.enabled).toBe(false);
    });
  });
});
