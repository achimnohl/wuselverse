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
  demoUserEmail: String(argv.demoUserEmail || process.env.DEMO_USER_EMAIL || process.env.DEMO_OWNER_EMAIL || 'demo.user@example.com'),
  demoUserPassword: String(argv.demoUserPassword || process.env.DEMO_USER_PASSWORD || process.env.DEMO_OWNER_PASSWORD || 'demodemo'),
  demoUserDisplayName: String(argv.demoUserDisplayName || process.env.DEMO_USER_DISPLAY_NAME || process.env.DEMO_OWNER_DISPLAY_NAME || 'Demo User'),
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

function isWriteMethod(method = 'GET') {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method).toUpperCase());
}

function getSetCookieHeaders(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie();
  }

  const singleCookie = response.headers.get('set-cookie');
  return singleCookie ? [singleCookie] : [];
}

function updateCookieJar(cookieJar, setCookieHeaders) {
  for (const cookie of setCookieHeaders) {
    const [nameValue] = cookie.split(';');
    const separatorIndex = nameValue.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const name = nameValue.slice(0, separatorIndex).trim();
    const value = nameValue.slice(separatorIndex + 1).trim();
    cookieJar.set(name, value);
  }
}

function buildCookieHeader(cookieJar) {
  return [...cookieJar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

function createSessionContext() {
  return {
    cookies: new Map(),
    csrfToken: null,
    user: null,
  };
}

async function requestJson(url, options = {}, session = null) {
  const { timeoutMs = 15000, headers = {}, ...rest } = options;
  const method = String(rest.method || 'GET').toUpperCase();
  const requestHeaders = {
    Accept: 'application/json',
    ...headers,
  };

  if (session?.cookies?.size) {
    requestHeaders.Cookie = buildCookieHeader(session.cookies);
  }

  if (session?.csrfToken && isWriteMethod(method) && !requestHeaders['X-CSRF-Token']) {
    requestHeaders['X-CSRF-Token'] = session.csrfToken;
  }

  const response = await fetch(url, {
    ...rest,
    headers: requestHeaders,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (session) {
    updateCookieJar(session.cookies, getSetCookieHeaders(response));
    if (session.cookies.has('wuselverse_csrf')) {
      session.csrfToken = session.cookies.get('wuselverse_csrf');
    }
  }

  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (session && payload?.data?.csrfToken) {
    session.csrfToken = payload.data.csrfToken;
  }

  if (!response.ok) {
    const details = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const error = new Error(`${method} ${url} failed: ${response.status} ${response.statusText}${details ? ` - ${details}` : ''}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function ensureDemoUserSession() {
  const session = createSessionContext();
  const registerPayload = {
    email: config.demoUserEmail,
    password: config.demoUserPassword,
    displayName: config.demoUserDisplayName,
  };

  let authResponse;
  try {
    authResponse = await requestJson(`${config.apiBaseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registerPayload),
    }, session);
  } catch (error) {
    if (error.status !== 409) {
      throw error;
    }

    authResponse = await requestJson(`${config.apiBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: config.demoUserEmail,
        password: config.demoUserPassword,
      }),
    }, session);
  }

  const meResponse = await requestJson(`${config.apiBaseUrl}/api/auth/me`, {}, session);
  session.user = meResponse?.data?.user || authResponse?.data?.user || null;

  if (!session.cookies.get('wuselverse_session')) {
    throw new Error('Demo sign-in succeeded but no session cookie was issued.');
  }

  if (!session.csrfToken) {
    throw new Error('Demo sign-in succeeded but no CSRF token was issued.');
  }

  return session;
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

    logStep('[1/7] Signing in demo user...');
    const demoSession = await ensureDemoUserSession();
    logOk(`Signed in as ${demoSession.user?.displayName || config.demoUserDisplayName} (${demoSession.user?.email || config.demoUserEmail})`);
    await pauseBetweenSteps();

    logStep('[2/7] Creating task...');
    const taskPayload = {
      title: 'Reverse my motivational quote',
      description: "Reverse: 'The future is autonomous'",
      poster: demoSession.user?.id || config.demoUserEmail,
      requirements: { capabilities: ['text-reverse'] },
      budget: { type: 'fixed', amount: 10, currency: 'USD' },
      acceptanceCriteria: [
        'Return the reversed quote as the result',
        'Include the original text and operation in the delivery payload',
      ],
      metadata: { input: { text: 'The future is autonomous', operation: 'reverse' } },
    };

    const createResponse = await requestJson(`${config.apiBaseUrl}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskPayload),
    }, demoSession);

    const createdTask = getTaskData(createResponse);
    const taskId = createdTask?._id ?? createdTask?.id;
    if (!taskId) {
      throw new Error('Task creation succeeded but no task id was returned.');
    }

    logOk(`Task created: ${taskId}`);
    await pauseBetweenSteps();

    logStep('[3/7] Waiting for agent to bid...');
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

    logStep('[4/7] Accepting bid...');
    const selectedBid = validBids[0];
    const bidId = getBidId(selectedBid);
    if (!bidId) {
      throw new Error(`A bid response was received, but no valid bid id was available to accept. Raw bids: ${JSON.stringify(validBids)}`);
    }

    await requestJson(`${config.apiBaseUrl}/api/tasks/${taskId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bidId }),
    }, demoSession);

    logOk(`Bid accepted: ${bidId}`);
    await pauseBetweenSteps();

    logStep('[5/7] Waiting for agent to deliver task output...');
    let completedTask = null;

    for (let attempt = 1; attempt <= config.maxCompletionWaitSeconds; attempt += 1) {
      const taskResponse = await requestJson(`${config.apiBaseUrl}/api/tasks/${taskId}`, {
        timeoutMs: 10000,
      });

      completedTask = getTaskData(taskResponse);
      const status = completedTask?.status;

      if (status === 'pending_review' || status === 'completed') {
        break;
      }

      if (status === 'failed' || status === 'disputed') {
        throw new Error(`Task entered the ${status} state during the demo.`);
      }

      await sleep(1000);
    }

    if (!completedTask || !['pending_review', 'completed'].includes(completedTask.status)) {
      throw new Error(
        `Task did not reach a reviewable state within ${config.maxCompletionWaitSeconds} seconds. Current status: ${completedTask?.status || 'unknown'}`
      );
    }

    const pendingResult = completedTask?.outcome?.result || completedTask?.result || {};
    const resultText = pendingResult?.result || pendingResult?.output?.result || JSON.stringify(pendingResult);

    logOk(`Status: ${completedTask.status}`);
    logInfo(`[RESULT] ${resultText}`);
    await pauseBetweenSteps();

    if (completedTask.status === 'pending_review') {
      logStep('[6/7] Verifying delivery...');
      await requestJson(`${config.apiBaseUrl}/api/tasks/${taskId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedback: 'Verified automatically by the demo flow.',
        }),
      }, demoSession);

      const verifiedResponse = await requestJson(`${config.apiBaseUrl}/api/tasks/${taskId}`, { timeoutMs: 10000 });
      completedTask = getTaskData(verifiedResponse);
      logOk(`Status: ${completedTask.status} (${completedTask?.outcome?.verificationStatus || 'verified'})`);
      await pauseBetweenSteps();
    }

    logStep('[7/7] Submitting review...');
    const reviewPayload = {
      taskId,
      from: demoSession.user?.id || config.demoUserEmail,
      to: completedTask.assignedAgent,
      rating: 5,
      comment: 'Perfect! Instant results!',
    };

    await requestJson(`${config.apiBaseUrl}/api/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reviewPayload),
    }, demoSession);

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
