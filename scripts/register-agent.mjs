#!/usr/bin/env node
/**
 * Local MCP test script — registers an agent via the platform's MCP server.
 *
 * Usage:
 *   npm run mcp:register                          # uses built-in sample payload
 *   npm run mcp:register -- --payload my.json     # load payload from a JSON file
 *   npm run mcp:register -- --server http://localhost:3000/mcp
 *
 * On success the script prints the agent ID and API key (store it — shown once).
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { readFileSync } from 'fs';
import { parseArgs } from 'util';

// ── CLI args ──────────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    server:  { type: 'string', default: 'http://localhost:3000/mcp' },
    payload: { type: 'string' },
    help:    { type: 'boolean', short: 'h' },
  },
  allowPositionals: false,
  strict: false,
});

if (args.help) {
  console.log(`
Usage: npm run mcp:register [-- --server <url>] [-- --payload <file.json>]

Options:
  --server   MCP server URL  (default: http://localhost:3000/mcp)
  --payload  Path to a JSON file containing the agent payload
  --help     Show this message
`);
  process.exit(0);
}

// ── Default sample payload ────────────────────────────────────────────────────

const DEFAULT_PAYLOAD = {
  name: 'Demo Code Reviewer',
  description: 'Reviews pull requests and suggests improvements based on best practices.',
  offer: 'I analyse your PR diff and return structured review comments with severity levels.',
  userManual: '## Usage\nPoint me at a GitHub PR and I will return a JSON report.',
  owner: 'local-dev',
  capabilities: [
    { skill: 'code-review', level: 'expert', tags: ['typescript', 'nodejs'] },
    { skill: 'security-scan', level: 'intermediate' },
  ],
  pricing: { model: 'fixed', amount: 2, currency: 'USD' },
};

function loadPayload() {
  if (args.payload) {
    try {
      const raw = readFileSync(args.payload, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      console.error(`❌  Could not read payload file: ${args.payload}\n${err.message}`);
      process.exit(1);
    }
  }
  return DEFAULT_PAYLOAD;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const serverUrl = args.server;
  const payload   = loadPayload();

  console.log(`\n🔌  Connecting to MCP server at ${serverUrl} …\n`);

  const transport = new StreamableHTTPClientTransport(new URL(serverUrl));
  const client    = new Client({ name: 'register-agent-script', version: '1.0.0' });

  await client.connect(transport);

  console.log('📋  Registering agent with payload:');
  console.log(JSON.stringify(payload, null, 2));
  console.log('');

  let result;
  try {
    result = await client.callTool({ name: 'register_agent', arguments: payload });
  } catch (err) {
    console.error('❌  Tool call failed:', err.message);
    await client.close();
    process.exit(1);
  }

  await client.close();

  // The result content is an array of { type, text } blocks
  const text = result?.content?.find(b => b.type === 'text')?.text ?? JSON.stringify(result);

  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = null; }

  if (parsed?.success === false || result?.isError) {
    console.error('❌  Registration failed:\n', text);
    process.exit(1);
  }

  console.log('✅  Agent registered!\n');

  if (parsed?.apiKey) {
    const data = parsed.data ?? parsed;
    console.log('┌─────────────────────────────────────────────────────┐');
    console.log('│  SAVE THIS KEY — it will not be shown again          │');
    console.log('├─────────────────────────────────────────────────────┤');
    console.log(`│  Agent ID : ${(data._id ?? data.id ?? '').padEnd(37)} │`);
    console.log(`│  API Key  : ${parsed.apiKey.padEnd(37)} │`);
    console.log('└─────────────────────────────────────────────────────┘');
  } else {
    console.log(text);
  }
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
