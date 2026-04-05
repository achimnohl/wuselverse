#!/usr/bin/env node

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;

    const withoutPrefix = arg.slice(2);
    const eqIndex = withoutPrefix.indexOf('=');

    if (eqIndex >= 0) {
      const key = withoutPrefix.slice(0, eqIndex);
      const value = withoutPrefix.slice(eqIndex + 1);
      args[key] = value;
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[withoutPrefix] = next;
      i += 1;
    } else {
      args[withoutPrefix] = 'true';
    }
  }

  return args;
}

const argv = parseArgs(process.argv.slice(2));
const config = {
  apiBaseUrl: String(argv.apiBaseUrl || process.env.API_BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  maxBidWaitSeconds: Number(argv.maxBidWaitSeconds || process.env.MAX_BID_WAIT_SECONDS || 15),
  maxCompletionWaitSeconds: Number(argv.maxCompletionWaitSeconds || process.env.MAX_COMPLETION_WAIT_SECONDS || 15),
  pauseSeconds: Number(argv.pauseSeconds || process.env.DEMO_PAUSE_SECONDS || 3),
};

const colors = {
  reset: '\u001b[0m',
  cyan: '\u001b[36m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  red: '\u001b[31m',
};

function colorize(color, message) {
  return `${colors[color] || ''}${message}${colors.reset}`;
}

function logStep(message) {
  console.log(colorize('yellow', `\n${message}`));
}

function logOk(message) {
  console.log(colorize('green', `[OK] ${message}`));
}

function logInfo(message) {
  console.log(colorize('cyan', message));
}

async function pauseBetweenSteps() {
  if (config.pauseSeconds > 0) {
    await sleep(config.pauseSeconds * 1000);
  }
}

async function requestJson(url, options = {}) {
  const { timeoutMs = 15000, headers = {}, ...rest } = options;
  const response = await fetch(url, {
    ...rest,
    headers: {
      Accept: 'application/json',
      ...headers,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const details = typeof payload === 'string' ? payload : JSON.stringify(payload);
    throw new Error(`${rest.method || 'GET'} ${url} failed: ${response.status} ${response.statusText}${details ? ` - ${details}` : ''}`);
  }

  return payload;
}

function getTaskData(payload) {
  return payload?.data ?? payload;
}

function getBidList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.bids)) return payload.bids;
  if (Array.isArray(payload?.data?.bids)) return payload.data.bids;
  return [];
}

function getBidId(bid) {
  return bid?.id ?? bid?._id ?? bid?.bidId ?? null;
}

async function ensureApiAvailable() {
  await requestJson(`${config.apiBaseUrl}/api/health`, { timeoutMs: 5000 });
}

async function main() {
  logInfo('\n=== WUSELVERSE DEMO: TEXT PROCESSOR AGENT ===');
  console.log(`API: ${config.apiBaseUrl}`);

  try {
    await ensureApiAvailable();

    logStep('[1/5] Creating task...');
    const taskPayload = {
      title: 'Reverse my motivational quote',
      description: "Reverse: 'The future is autonomous'",
      poster: 'demo-user',
      requirements: { capabilities: ['text-reverse'] },
      budget: { type: 'fixed', amount: 10, currency: 'USD' },
      metadata: { input: { text: 'The future is autonomous', operation: 'reverse' } },
    };

    const createResponse = await requestJson(`${config.apiBaseUrl}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskPayload),
    });

    const createdTask = getTaskData(createResponse);
    const taskId = createdTask?._id ?? createdTask?.id;
    if (!taskId) {
      throw new Error('Task creation succeeded but no task id was returned.');
    }

    logOk(`Task created: ${taskId}`);
    await pauseBetweenSteps();

    logStep('[2/5] Waiting for agent to bid...');
    let validBids = [];

    for (let attempt = 1; attempt <= config.maxBidWaitSeconds; attempt += 1) {
      const bidResponse = await requestJson(`${config.apiBaseUrl}/api/tasks/${taskId}/bids`, {
        timeoutMs: 10000,
      });

      validBids = getBidList(bidResponse).filter((bid) => {
        const bidId = getBidId(bid);
        return typeof bidId === 'string' && bidId.trim().length > 0;
      });

      if (validBids.length > 0) {
        break;
      }

      await sleep(1000);
    }

    if (validBids.length === 0) {
      throw new Error(
        `No valid bids were received within ${config.maxBidWaitSeconds} seconds. Start the demo agent with 'npm run demo:agent' and try again.`
      );
    }

    logOk(`Received ${validBids.length} bid(s)`);
    await pauseBetweenSteps();

    logStep('[3/5] Accepting bid...');
    const selectedBid = validBids[0];
    const bidId = getBidId(selectedBid);
    if (!bidId) {
      throw new Error(`A bid response was received, but no valid bid id was available to accept. Raw bids: ${JSON.stringify(validBids)}`);
    }

    await requestJson(`${config.apiBaseUrl}/api/tasks/${taskId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bidId }),
    });

    logOk(`Bid accepted: ${bidId}`);
    await pauseBetweenSteps();

    logStep('[4/5] Waiting for agent to complete task...');
    let completedTask = null;

    for (let attempt = 1; attempt <= config.maxCompletionWaitSeconds; attempt += 1) {
      const taskResponse = await requestJson(`${config.apiBaseUrl}/api/tasks/${taskId}`, {
        timeoutMs: 10000,
      });

      completedTask = getTaskData(taskResponse);
      const status = completedTask?.status;

      if (status === 'completed') {
        break;
      }

      if (status === 'failed') {
        throw new Error('Task entered the failed state during the demo.');
      }

      await sleep(1000);
    }

    if (!completedTask || completedTask.status !== 'completed') {
      throw new Error(
        `Task did not complete within ${config.maxCompletionWaitSeconds} seconds. Current status: ${completedTask?.status || 'unknown'}`
      );
    }

    const resultText = completedTask?.result?.output?.result || JSON.stringify(completedTask?.result || {});

    logOk(`Status: ${completedTask.status}`);
    logInfo(`[RESULT] ${resultText}`);
    await pauseBetweenSteps();

    logStep('[5/5] Submitting review...');
    const reviewPayload = {
      taskId,
      from: 'demo-user',
      to: completedTask.assignedAgent,
      rating: 5,
      comment: 'Perfect! Instant results!',
    };

    await requestJson(`${config.apiBaseUrl}/api/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reviewPayload),
    });

    logOk('Review submitted');
    await pauseBetweenSteps();

    logInfo('\n=== DEMO COMPLETE ===');
    console.log('Original: "The future is autonomous"');
    console.log(colorize('green', `Result:   "${resultText}"`));
  } catch (error) {
    console.error(colorize('red', `\n[ERROR] Demo failed: ${error.message}`));
    process.exitCode = 1;
  }
}

await main();
