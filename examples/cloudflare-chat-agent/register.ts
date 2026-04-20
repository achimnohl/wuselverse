#!/usr/bin/env node
/**
 * Register the Cloudflare Chat Agent with Wuselverse
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '../../.env') });

const PLATFORM_URL = process.env.API_URL || 'http://localhost:3000';
const API_KEY = process.env.WUSELVERSE_API_KEY;
const CHAT_PORT = parseInt(process.env.CHAT_PORT || '3002', 10);
const CHAT_HOST = process.env.CHAT_HOST || 'localhost';
const CLOUDFLARE_MODEL = process.env.COMPLIANCE_LLM_MODEL || '@cf/moonshotai/kimi-k2.5';

if (!API_KEY) {
  console.error('❌ Missing WUSELVERSE_API_KEY in .env');
  console.error('   Create a user API key in the platform UI (Settings → API Keys)');
  process.exit(1);
}

async function registerAgent() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║      Registering Cloudflare Chat Agent with Wuselverse      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const agentConfig = {
    name: 'Cloudflare AI Assistant',
    description: 'General-purpose AI assistant powered by Cloudflare AI Workers (Kimi K2.5)',
    owner: 'demo-user',
    capabilities: [
      {
        skill: 'text-generation',
        description: 'Generate creative and informative text content',
        inputs: [],
        outputs: []
      },
      {
        skill: 'question-answering',
        description: 'Answer questions and provide explanations',
        inputs: [],
        outputs: []
      },
      {
        skill: 'summarization',
        description: 'Summarize long-form content',
        inputs: [],
        outputs: []
      },
      {
        skill: 'code-explanation',
        description: 'Explain code snippets and programming concepts',
        inputs: [],
        outputs: []
      }
    ],
    pricing: {
      type: 'fixed',
      amount: 10,
      currency: 'USD'
    },
    chatEndpoint: {
      url: `http://${CHAT_HOST}:${CHAT_PORT}/v1/chat/completions`,
      authType: 'none',
      model: CLOUDFLARE_MODEL,
      systemPrompt: 'You are a helpful AI assistant. Complete the requested task and provide a clear, concise response.',
      parameters: {
        temperature: 0.7,
        max_tokens: 1500
      }
    },
    autoBidding: {
      enabled: true,
      matchCapabilities: ['text-generation', 'question-answering', 'summarization', 'code-explanation'],
      bidPricing: {
        type: 'fixed',
        amount: 10,
        currency: 'USD'
      }
    }
  };

  try {
    console.log(`📡 Registering agent at ${PLATFORM_URL}/api/agents`);
    console.log(`🔗 Chat endpoint: ${agentConfig.chatEndpoint.url}`);
    console.log(`🤖 Model: ${agentConfig.chatEndpoint.model}`);
    console.log(`🎯 Auto-bidding: ${agentConfig.autoBidding.enabled ? 'Enabled' : 'Disabled'}\n`);

    const response = await fetch(`${PLATFORM_URL}/api/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify(agentConfig)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(`Registration failed: ${JSON.stringify(result, null, 2)}`);
    }

    console.log('✅ Agent registered successfully!\n');
    console.log('Registration Details:');
    console.log('─────────────────────────────────────────────────────────────');
    console.log(`  Agent ID: ${result.data._id}`);
    console.log(`  Agent API Key: ${result.apiKey || '(already exists)'}`);
    console.log(`  Status: ${result.data.status}`);
    console.log(`  Capabilities: ${result.data.capabilities.map(c => c.skill).join(', ')}`);
    console.log(`  Auto-Bidding: ${result.data.autoBidding?.enabled ? '✓ Enabled' : '✗ Disabled'}`);
    console.log('─────────────────────────────────────────────────────────────\n');

    if (result.apiKey) {
      console.log('⚠️  IMPORTANT: Save the Agent API Key above - it is shown only once!\n');
    }

    console.log('🎉 Your agent is now live in the marketplace!');
    console.log(`   View it at: ${PLATFORM_URL.replace('/api', '')}/agents\n`);

  } catch (error) {
    console.error('\n❌ Registration failed:', error.message);
    process.exit(1);
  }
}

registerAgent();
