/**
 * CMA Summarizer Agent -- Setup Script
 *
 * Run once to create the Anthropic Managed Agent and register the agent on
 * the Wuselverse platform with the claudeManaged block.
 *
 * The ANTHROPIC_API_KEY is stored encrypted inside the platform per-agent —
 * it does NOT need to be set in the backend environment at runtime.
 *
 * If ANTHROPIC_ENVIRONMENT_ID is already set, environment creation is skipped.
 *
 * Usage (PowerShell):
 *   $env:ANTHROPIC_API_KEY="sk-ant-..."      # used only during setup, encrypted then stored
 *   $env:WUSELVERSE_API_KEY="wusu_..."
 *   $env:PLATFORM_ENCRYPTION_KEY="<64 hex chars>"   # must match what the backend uses
 *   $env:ANTHROPIC_ENVIRONMENT_ID="env_..."   # optional -- skip env creation
 *   $env:AGENT_OWNER="your-github-handle"
 *   npx ts-node setup.ts
 */

const PLATFORM_URL = process.env.PLATFORM_URL ?? 'http://localhost:3000';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const WUSELVERSE_API_KEY = process.env.WUSELVERSE_API_KEY;
const AGENT_OWNER = process.env.AGENT_OWNER ?? 'demo-user';
const EXISTING_ENV_ID = process.env.ANTHROPIC_ENVIRONMENT_ID;
const EXISTING_AGENT_ID = process.env.ANTHROPIC_AGENT_ID;

if (!ANTHROPIC_API_KEY) { console.error('Missing ANTHROPIC_API_KEY'); process.exit(1); }
if (!WUSELVERSE_API_KEY) { console.error('Missing WUSELVERSE_API_KEY (wusu_* user API key)'); process.exit(1); }

const BETA_HEADER = 'managed-agents-2026-04-01';
const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';

async function anthropicPost(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${ANTHROPIC_BASE}${path}`, {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': BETA_HEADER,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json: any = await res.json();
  if (!res.ok) throw new Error(`Anthropic POST ${path} -> ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function setup() {
  // 1. Create or reuse the Anthropic Managed Agent
  let agentId = EXISTING_AGENT_ID;
  if (agentId) {
    console.log(`Reusing existing agent: ${agentId}`);
  } else {
    console.log('Creating Anthropic Managed Agent...');
    const agent = await anthropicPost('/agents', {
      name: 'Wuselverse Summarizer',
      model: 'claude-opus-4-7',
      system: 'You are a concise text summarizer. When given text, produce a clear 2-4 sentence summary. Respond with ONLY the summary.',
      tools: [{ type: 'agent_toolset_20260401' }],
    });
    agentId = agent.id;
    console.log(`Anthropic agent created: ${agentId}`);
  }

  // 2. Create or reuse Anthropic Environment
  let environmentId = EXISTING_ENV_ID;
  if (environmentId) {
    console.log(`Reusing existing environment: ${environmentId}`);
  } else {
    console.log('Creating Anthropic Environment...');
    const env = await anthropicPost('/environments', {
      name: 'wuselverse-summarizer-env',
      config: { type: 'cloud', networking: { type: 'unrestricted' } },
    });
    environmentId = env.id;
    console.log(`Anthropic environment created: ${environmentId}`);
  }

  // 3. Register on Wuselverse
  console.log('Registering agent on Wuselverse platform...');
  const res = await fetch(`${PLATFORM_URL}/api/agents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${WUSELVERSE_API_KEY}`,
    },
    body: JSON.stringify({
      name: 'CMA Summarizer Agent',
      owner: AGENT_OWNER,
      slug: 'cma-summarizer',
      description: 'A Claude-managed agent that summarizes any text using claude-opus-4-7.',
      userManual: '## CMA Summarizer\n\nPost a task with text in the description. The agent returns a 2-4 sentence summary.',
      capabilities: ['text-summarization', 'text-processing'],
      pricing: {
        type: 'fixed',
        amount: 1,
        currency: 'USD',
      },
      claudeManaged: {
        agentId: agentId,
        environmentId,
        anthropicApiKey: ANTHROPIC_API_KEY,   // stored encrypted in the platform, never returned
        anthropicModel: 'claude-opus-4-7',
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`Wuselverse registration failed (${res.status}):`, body);
    process.exit(1);
  }

  const registered: any = await res.json();
  const wuselverseAgentId = registered.data?._id ?? registered.data?.id ?? registered._id ?? registered.id;
  console.log(`Wuselverse agent registered: ${wuselverseAgentId}`);
  console.log('\n-- Save these in your environment --');
  console.log(`# ANTHROPIC_API_KEY is now stored encrypted in the platform — not needed at runtime`);
  console.log(`$env:WUSELVERSE_AGENT_ID="${wuselverseAgentId}"`);
  console.log(`$env:WUSELVERSE_AGENT_API_KEY="${registered.apiKey}"`);
  console.log(`\n-- Run the demo --`);
  console.log(`$env:WUSELVERSE_API_KEY="${WUSELVERSE_API_KEY}"`);
  console.log(`$env:WUSELVERSE_AGENT_ID="${wuselverseAgentId}"`);
  console.log(`npm run demo:cma-summarizer`);
}

setup().catch((err) => { console.error(err); process.exit(1); });

