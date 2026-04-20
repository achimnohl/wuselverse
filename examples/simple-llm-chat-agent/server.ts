#!/usr/bin/env node
/**
 * Cloudflare Chat Endpoint Agent - OpenAI-Compatible Chat Server
 * 
 * This agent exposes an OpenAI-compatible chat completion endpoint that uses
 * Cloudflare AI Workers for LLM inference. It can be registered with Wuselverse
 * as a Chat Endpoint agent.
 */

import express from 'express';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables from workspace root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '../../.env') });

const app = express();
app.use(express.json());

// Configuration
const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_ENDPOINT = process.env.LLM_ENDPOINT;
const LLM_MODEL = process.env.LLM_MODEL || '@cf/moonshotai/kimi-k2.5';
const CHAT_PORT = parseInt(process.env.CHAT_PORT || '3002', 10);
const CHAT_HOST = process.env.CHAT_HOST || 'localhost';

if (!LLM_API_KEY || !LLM_ENDPOINT) {
  console.error('❌ Missing Cloudflare AI configuration');
  console.error('   Set COMPLIANCE_LLM_API_KEY and COMPLIANCE_LLM_ENDPOINT in .env');
  process.exit(1);
}

/**
 * OpenAI-compatible chat completion endpoint
 */
app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { messages, model, temperature, max_tokens, ...otherParams } = req.body;

    console.log(`[Chat Agent] Received request with ${messages?.length || 0} messages`);

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: {
          message: 'Invalid request: messages array is required',
          type: 'invalid_request_error'
        }
      });
    }

    // Forward request to Cloudflare AI Workers
    const response = await fetch(LLM_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LLM_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model || LLM_MODEL,
        messages,
        temperature: temperature || 0.7,
        max_tokens: max_tokens || 1000,
        ...otherParams
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Chat Agent] Cloudflare API error: ${response.status} ${errorText}`);
      return res.status(response.status).json({
        error: {
          message: `Cloudflare API error: ${errorText}`,
          type: 'api_error'
        }
      });
    }

    const result = await response.json();
    console.log(`[Chat Agent] Successfully generated response`);

    // Return OpenAI-compatible response
    res.json(result);
  } catch (error) {
    console.error('[Chat Agent] Error:', error);
    res.status(500).json({
      error: {
        message: error.message || 'Internal server error',
        type: 'internal_error'
      }
    });
  }
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'cloudflare-chat-agent',
    model: LLM_MODEL,
    timestamp: new Date().toISOString()
  });
});

/**
 * Root endpoint with service info
 */
app.get('/', (req, res) => {
  res.json({
    name: 'Cloudflare Chat Agent',
    description: 'OpenAI-compatible chat endpoint powered by Cloudflare AI Workers',
    model: LLM_MODEL,
    endpoints: {
      chat: '/v1/chat/completions',
      health: '/health'
    },
    documentation: 'https://github.com/[your-org]/wuselverse/tree/main/examples/cloudflare-chat-agent'
  });
});

// Start server
app.listen(CHAT_PORT, CHAT_HOST, () => {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║        Cloudflare Chat Agent - OpenAI-Compatible API        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\n✓ Server running on http://${CHAT_HOST}:${CHAT_PORT}`);
  console.log(`✓ Model: ${LLM_MODEL}`);
  console.log(`\nEndpoints:`);
  console.log(`  • Chat: POST http://${CHAT_HOST}:${CHAT_PORT}/v1/chat/completions`);
  console.log(`  • Health: GET http://${CHAT_HOST}:${CHAT_PORT}/health`);
  console.log(`\nReady to receive task execution requests from Wuselverse! 🚀\n`);
});
