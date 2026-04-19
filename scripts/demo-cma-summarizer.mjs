#!/usr/bin/env node
/**
 * demo-cma-summarizer.mjs
 *
 * End-to-end demo of the CMA Summarizer Agent:
 *   1. Posts a text-summarization task as the platform user
 *   2. Waits for the platform to auto-bid on behalf of the CMA agent
 *   3. Accepts the bid
 *   4. Waits for the platform to execute the task via Claude Managed Agents
 *   5. Prints the summary and exits
 *
 * No local agent process needed — execution is handled by the Wuselverse platform.
 *
 * Prerequisites:
 *   - Platform API deployed at a publicly accessible URL
 *     (Claude needs to reach the callback endpoint — localhost will not work)
 *   - CMA agent already registered (run setup.ts first — Anthropic key is stored encrypted on the platform)
 *
 * Usage (PowerShell):
 *   $env:WUSELVERSE_API_KEY="wusu_..."           # platform user API key
 *   $env:WUSELVERSE_AGENT_ID="<mongo-id>"
 *   $env:PLATFORM_URL="https://your-platform.example.com"  # must be publicly reachable
 *   node scripts/demo-cma-summarizer.mjs
 */


const PLATFORM_URL = process.env.PLATFORM_URL ?? 'http://localhost:3000';
const USER_API_KEY = process.env.WUSELVERSE_API_KEY;
const AGENT_ID = process.env.WUSELVERSE_AGENT_ID;

// ── Validation ────────────────────────────────────────────────────────────────

const required = [
  'WUSELVERSE_API_KEY',
  'WUSELVERSE_AGENT_ID',
];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing required env vars: ${missing.join(', ')}`);
  console.error('Run setup.ts first: npx ts-node examples/cma-summarizer-agent/setup.ts');
  process.exit(1);
}

// ── Colors ────────────────────────────────────────────────────────────────────

const c = {
  reset: '\x1b[0m',
  cyan:  '\x1b[36m',
  green: '\x1b[32m',
  yellow:'\x1b[33m',
  red:   '\x1b[31m',
  bold:  '\x1b[1m',
};
const step   = (msg) => console.log(`\n${c.yellow}▶ ${msg}${c.reset}`);
const ok     = (msg) => console.log(`${c.green}✔ ${msg}${c.reset}`);
const info   = (msg) => console.log(`${c.cyan}  ${msg}${c.reset}`);
const err    = (msg) => console.error(`${c.red}✘ ${msg}${c.reset}`);

const sleep  = (ms) => new Promise((r) => setTimeout(r, ms));

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function apiPost(path, body, apiKey = USER_API_KEY) {
  const res = await fetch(`${PLATFORM_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function apiGet(path, apiKey = USER_API_KEY) {
  const res = await fetch(`${PLATFORM_URL}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

// ── Demo text ─────────────────────────────────────────────────────────────────

const DEMO_TEXT = `
AI coding assistants help developers write code faster and catch bugs earlier.
Studies show productivity gains of up to 55%. Junior developers benefit most,
gaining access to guidance previously reserved for senior engineers.
Challenges include AI-generated bugs and over-reliance reducing skill growth.
`.trim();

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`${c.bold}${c.cyan}━━━ CMA Summarizer Agent Demo ━━━${c.reset}`);
  info(`Platform: ${PLATFORM_URL}`);
  info(`Agent ID: ${AGENT_ID}`);

  // 1. Post a task
  step('Posting text-summarization task…');
  const taskRes = await apiPost('/api/tasks', {
    title: 'Summarize: AI in Software Development',
    description: DEMO_TEXT,
    requirements: { capabilities: ['text-summarization'] },
    budget: { amount: 5, currency: 'USD', type: 'fixed' },
  });
  const taskId = taskRes?.data?._id ?? taskRes?.data?.id ?? taskRes?._id;
  if (!taskId) throw new Error(`Could not extract task ID from: ${JSON.stringify(taskRes)}`);
  ok(`Task created: ${taskId}`);

  // 2. Wait for the platform to auto-bid on behalf of the CMA agent
  step('Waiting for platform to bid on behalf of CMA agent…');
  let bidId = null;
  for (let i = 0; i < 15; i++) {
    await sleep(2_000);
    const bidsRes = await apiGet(`/api/tasks/${taskId}/bids`).catch(() => ({ bids: [] }));
    const bids = bidsRes?.bids ?? bidsRes?.data?.data ?? bidsRes?.data ?? [];
    const ourBid = bids.find((b) => b.agentId === AGENT_ID);
    if (ourBid) {
      bidId = ourBid._id ?? ourBid.id;
      ok(`Bid received: ${bidId} — "${ourBid.proposal?.slice(0, 60)}…"`);
      break;
    }
    info(`No bid yet (${(i + 1) * 2}s elapsed)…`);
  }
  if (!bidId) throw new Error('Platform did not auto-bid for CMA agent within 30s');

  // 3. Accept the bid
  step('Accepting bid…');
  await apiPost(`/api/tasks/${taskId}/assign`, { bidId });
  ok('Bid accepted — platform will execute task via CMA');

  // 4. Wait for completion (up to 2 minutes)
  step('Waiting for platform to execute via Claude Managed Agents…');
  let finalTask = null;
  for (let i = 0; i < 30; i++) {
    await sleep(4_000);
    const taskRes2 = await apiGet(`/api/tasks/${taskId}`).catch(() => null);
    const task = taskRes2?.data ?? taskRes2;
    if (task?.status === 'pending_review' || task?.status === 'completed') {
      finalTask = task;
      break;
    }
    if (task?.status === 'failed') {
      const errMsg = task?.outcome?.result?.output?.error ?? task?.outcome?.output?.error ?? 'unknown error';
      err(`Task failed on the platform: ${errMsg}`);
      err('Check platform logs for details. Ensure the platform is deployed at a public URL so Claude can reach the callback endpoint.');
      process.exit(1);
    }
    info(`Task status: ${task?.status ?? 'unknown'} (${(i + 1) * 4}s elapsed)…`);
  }

  if (!finalTask) {
    err('Task was not completed within 2 minutes');
    process.exit(1);
  }

  // 5. Display result
  const summary =
    finalTask.outcome?.result?.output?.summary ??
    finalTask.outcome?.result?.summary ??
    finalTask.outcome?.output?.summary ??
    '(no summary in outcome)';

  console.log(`\n${c.bold}${c.green}━━━ Summary ━━━${c.reset}`);
  console.log(summary);
  console.log(`${c.green}━━━━━━━━━━━━━━━${c.reset}\n`);
  ok(`Task status: ${finalTask.status}`);
  process.exit(0);
}

main().catch((e) => {
  err(e.message);
  console.error(e);
  process.exit(1);
});
