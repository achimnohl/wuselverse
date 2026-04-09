import {
  AgentHttpServer,
  WuselverseAgent,
} from '../../dist/packages/agent-sdk/src/index.js';

type DemoSession = {
  cookies: Map<string, string>;
  csrfToken: string | null;
  user: { id?: string; email?: string; displayName?: string } | null;
};

type TextOperation = 'reverse' | 'word-count' | 'uppercase' | 'lowercase';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getSetCookieHeaders(response: any): string[] {
  if (typeof response?.headers?.getSetCookie === 'function') {
    return response.headers.getSetCookie();
  }

  const singleCookie = response?.headers?.get?.('set-cookie');
  return singleCookie ? [singleCookie] : [];
}

function updateCookieJar(cookieJar: Map<string, string>, setCookieHeaders: string[]): void {
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

function buildCookieHeader(cookieJar: Map<string, string>): string {
  return [...cookieJar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

function getTaskData(payload: any): any {
  return payload?.data ?? payload;
}

function getBidList(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.bids)) return payload.bids;
  if (Array.isArray(payload?.data?.bids)) return payload.data.bids;
  return [];
}

function getBidId(bid: any): string | null {
  return bid?.id ?? bid?._id ?? bid?.bidId ?? null;
}

function normalizeOperation(value: unknown): TextOperation {
  const raw = String(value || 'reverse').toLowerCase();

  switch (raw) {
    case 'word-count':
    case 'wordcount':
    case 'count':
      return 'word-count';
    case 'uppercase':
    case 'upper':
      return 'uppercase';
    case 'lowercase':
    case 'lower':
      return 'lowercase';
    default:
      return 'reverse';
  }
}

function getCapabilityForOperation(operation: TextOperation): string {
  switch (operation) {
    case 'reverse':
      return 'text-reverse';
    case 'word-count':
      return 'word-count';
    case 'uppercase':
    case 'lowercase':
      return 'case-convert';
    default:
      return 'text-reverse';
  }
}

async function requestJson(url: string, options: any = {}, session?: DemoSession): Promise<any> {
  const { timeoutMs = 15000, headers = {}, ...rest } = options;
  const method = String(rest.method || 'GET').toUpperCase();
  const requestHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...headers,
  };

  if (session?.cookies?.size) {
    requestHeaders.Cookie = buildCookieHeader(session.cookies);
  }

  if (session?.csrfToken && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !requestHeaders['X-CSRF-Token']) {
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
      session.csrfToken = session.cookies.get('wuselverse_csrf') || null;
    }
  }

  const text = await response.text();
  let payload: any = null;

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
    const error = new Error(`${method} ${url} failed: ${response.status} ${response.statusText}${details ? ` - ${details}` : ''}`) as Error & { status?: number; payload?: unknown };
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function ensureDemoOwnerSession(platformUrl: string): Promise<DemoSession> {
  const session: DemoSession = {
    cookies: new Map<string, string>(),
    csrfToken: null,
    user: null,
  };

  const email = process.env.DEMO_OWNER_EMAIL || 'demo.user@example.com';
  const password = process.env.DEMO_OWNER_PASSWORD || 'demodemo';
  const displayName = process.env.DEMO_OWNER_DISPLAY_NAME || 'Demo User';

  let authResponse: any;
  try {
    authResponse = await requestJson(`${platformUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName }),
    }, session);
  } catch (error: any) {
    if (error?.status !== 409) {
      throw error;
    }

    authResponse = await requestJson(`${platformUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }, session);
  }

  const meResponse = await requestJson(`${platformUrl}/api/auth/me`, {}, session);
  session.user = meResponse?.data?.user || authResponse?.data?.user || null;

  if (!session.cookies.get('wuselverse_session')) {
    throw new Error('Demo owner session was created but no session cookie was issued.');
  }

  if (!session.csrfToken) {
    throw new Error('Demo owner session was created but no CSRF token was issued.');
  }

  return session;
}

class DelegatingTextBrokerAgent extends WuselverseAgent {
  private readonly apiKey: string;
  private readonly agentId: string;
  private readonly platformUrl: string;

  constructor(config: { platformUrl: string; apiKey: string; agentId: string; mcpPort: number }) {
    super({
      name: 'Delegating Text Broker Agent',
      capabilities: ['delegated-text-workflow', 'text-broker', 'task-delegation'],
      mcpPort: config.mcpPort,
      platformUrl: config.platformUrl,
      apiKey: config.apiKey,
    });

    this.apiKey = config.apiKey;
    this.agentId = config.agentId;
    this.platformUrl = config.platformUrl.replace(/\/$/, '');
  }

  async evaluateTask(task: any): Promise<any> {
    console.log(`[BrokerAgent] Evaluating parent task: ${task.title}`);

    const requestedCapabilities = task.requirements?.capabilities || task.requirements?.skills || [];
    const matches = requestedCapabilities.some((cap: string) =>
      ['delegated-text-workflow', 'text-broker', 'task-delegation'].includes(cap)
    );

    if (!matches) {
      console.log('[BrokerAgent] No broker capability requested, declining task');
      return { interested: false };
    }

    const input = task.metadata?.input || task.input || {};
    const operation = normalizeOperation(input.operation || 'reverse');

    console.log(`[BrokerAgent] Bidding to broker a delegated ${operation} workflow`);

    return {
      interested: true,
      proposedAmount: 12,
      estimatedDuration: 20,
      proposal: `I will broker this ${operation} request through Wuselverse, subcontract the specialist text step, verify the child delivery, and return the final result.`,
      metadata: {
        mode: 'delegating-text-broker-demo',
        delegatedOperation: operation,
      },
    };
  }

  async executeTask(parentTaskId: string, details: any): Promise<any> {
    console.log(`[BrokerAgent] Executing parent task ${parentTaskId}`);

    const input = details?.metadata?.input || details?.input || {};
    const text = String(input.text || 'Delegation makes AI markets composable');
    const operation = normalizeOperation(input.operation || 'reverse');
    const capability = getCapabilityForOperation(operation);
    const parentBudget = Number(details?.budget?.amount ?? 18);
    const subtaskBudget = Math.max(5, Math.min(parentBudget > 2 ? parentBudget - 2 : parentBudget, 8));
    const preferredSubcontractors = await this.findPreferredTextProcessorAgents(capability);

    console.log(`[BrokerAgent] Creating child task for ${operation} (${capability})`);

    const childTask = await this.createSubtask(parentTaskId, {
      parentTaskId,
      title: `Delegated ${operation} text processing`,
      description: `Subcontract the ${operation} text operation for the parent request "${details?.title || parentTaskId}".`,
      requirements: {
        capabilities: [capability],
        ...(preferredSubcontractors.length > 0 ? { specificAgents: preferredSubcontractors } : {}),
      },
      budget: {
        type: 'fixed',
        amount: subtaskBudget,
        currency: details?.budget?.currency || 'USD',
      },
      acceptanceCriteria: [
        `Perform the ${operation} operation on the provided text.`,
        'Return the transformed output and include the original input in the delivery payload.',
      ],
      metadata: {
        demo: 'delegating-broker-agent',
        input: { text, operation },
        delegatedByAgentId: this.agentId,
        preferredSubcontractorIds: preferredSubcontractors,
      },
    });

    const subtaskId = String(childTask?.id || childTask?._id || '');
    if (!subtaskId) {
      throw new Error('Delegated subtask was created but no task id was returned.');
    }

    console.log(`[BrokerAgent] Child task created: ${subtaskId}`);

    const winningBid = await this.waitForSubtaskBid(subtaskId);
    const winningBidId = getBidId(winningBid);
    if (!winningBidId) {
      throw new Error(`The delegated task ${subtaskId} received a bid but no bid id was available.`);
    }

    await this.postAsAgent(`/api/tasks/${subtaskId}/assign`, { bidId: winningBidId });
    console.log(`[BrokerAgent] Accepted bid ${winningBidId} on child task ${subtaskId}`);

    let childDelivery = await this.waitForReviewableTask(subtaskId);

    if (childDelivery?.status === 'pending_review') {
      await this.postAsAgent(`/api/tasks/${subtaskId}/verify`, {
        feedback: 'Verified delegated text-processing output for the parent broker demo.',
      });

      const verifiedChildResponse = await requestJson(`${this.platformUrl}/api/tasks/${subtaskId}`, { method: 'GET' });
      childDelivery = getTaskData(verifiedChildResponse);
      console.log(`[BrokerAgent] Verified child task ${subtaskId}`);
    }

    const chain = await this.getTaskChain(parentTaskId);
    const childResult = childDelivery?.outcome?.result ?? childDelivery?.result ?? {};
    const finalText = childResult?.output?.result ?? childResult?.result ?? childResult;

    console.log(`[BrokerAgent] Parent task ${parentTaskId} ready for final delivery`);

    return {
      success: true,
      output: {
        summary: `Delegated the ${operation} work through Wuselverse to the text processor agent and verified the child delivery before closing the parent task.`,
        requestedOperation: operation,
        originalText: text,
        finalText,
        delegatedTaskId: subtaskId,
        subcontractorAgentId: childDelivery?.assignedAgent,
        rootTaskId: chain.rootTaskId,
        lineage: (chain.lineage || []).map((task: any) => ({
          taskId: task?.id || task?._id,
          title: task?.title,
          status: task?.status,
          delegationDepth: task?.delegationDepth ?? 0,
        })),
      },
      artifacts: [`root-task:${chain.rootTaskId}`, `child-task:${subtaskId}`],
      metadata: {
        demo: 'delegating-broker-agent',
        rootTaskId: chain.rootTaskId,
        delegatedChildTaskId: subtaskId,
        delegatedCapability: capability,
      },
    };
  }

  private async createSubtask(parentTaskId: string, payload: Record<string, unknown>): Promise<any> {
    const response = await requestJson(`${this.platformUrl}/api/tasks/${parentTaskId}/subtasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    return getTaskData(response);
  }

  private async getTaskChain(taskId: string): Promise<any> {
    const response = await requestJson(`${this.platformUrl}/api/tasks/${taskId}/chain`, {
      method: 'GET',
      timeoutMs: 10000,
    });

    return getTaskData(response);
  }

  private async findPreferredTextProcessorAgents(requiredCapability: string): Promise<string[]> {
    try {
      const response = await requestJson(`${this.platformUrl}/api/agents?page=1&limit=100`, { method: 'GET' });
      const items = Array.isArray(response?.data?.data)
        ? response.data.data
        : Array.isArray(response?.data)
          ? response.data
          : Array.isArray(response)
            ? response
            : [];

      return items
        .filter((agent: any) => {
          const capabilities = Array.isArray(agent?.capabilities)
            ? agent.capabilities.map((cap: any) => String(cap?.skill || cap))
            : [];

          return (
            String(agent?.id || agent?._id || '') !== this.agentId &&
            String(agent?.status || '').toLowerCase() !== 'inactive' &&
            (String(agent?.name || '').toLowerCase().includes('text processor') || capabilities.includes(requiredCapability))
          );
        })
        .map((agent: any) => String(agent?.id || agent?._id || ''))
        .filter(Boolean)
        .slice(0, 1);
    } catch (error) {
      console.warn('[BrokerAgent] Could not pre-select a text processor agent:', error);
      return [];
    }
  }

  private async waitForSubtaskBid(subtaskId: string, maxWaitSeconds: number = 20): Promise<any> {
    for (let attempt = 1; attempt <= maxWaitSeconds; attempt += 1) {
      const response = await requestJson(`${this.platformUrl}/api/tasks/${subtaskId}/bids`, { method: 'GET', timeoutMs: 10000 });
      const bids = getBidList(response).filter((bid) => !!getBidId(bid));

      if (bids.length > 0) {
        console.log(`[BrokerAgent] Received ${bids.length} delegated bid(s)`);
        return bids[0];
      }

      await sleep(1000);
    }

    throw new Error(
      `No delegated bid arrived for child task ${subtaskId}. Start the text processor agent with \"npm run demo:agent\" and try again.`
    );
  }

  private async waitForReviewableTask(taskId: string, maxWaitSeconds: number = 30): Promise<any> {
    for (let attempt = 1; attempt <= maxWaitSeconds; attempt += 1) {
      const response = await requestJson(`${this.platformUrl}/api/tasks/${taskId}`, { method: 'GET', timeoutMs: 10000 });
      const task = getTaskData(response);
      const status = String(task?.status || 'unknown');

      if (status === 'pending_review' || status === 'completed') {
        return task;
      }

      if (status === 'failed' || status === 'disputed') {
        throw new Error(`Child task ${taskId} moved to ${status} during delegated execution.`);
      }

      await sleep(1000);
    }

    throw new Error(`Child task ${taskId} did not reach a reviewable state within ${maxWaitSeconds} seconds.`);
  }

  private async postAsAgent(path: string, body: Record<string, unknown>): Promise<any> {
    return requestJson(`${this.platformUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });
  }
}

async function main() {
  const platformUrl = process.env.PLATFORM_URL || 'http://localhost:3000';
  const mcpPort = parseInt(process.env.MCP_PORT || '3004', 10);

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Delegating Text Broker Agent for Wuselverse Phase 3 Demo  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\nPlatform: ${platformUrl}`);
  console.log(`MCP Port: ${mcpPort}\n`);

  try {
    console.log('[1/4] Signing in demo owner...');
    const ownerSession = await ensureDemoOwnerSession(platformUrl);
    console.log(`✓ Demo owner ready: ${ownerSession.user?.displayName || ownerSession.user?.email || 'demo user'}`);

    console.log('\n[2/4] Registering broker agent with platform...');
    const registration: any = await requestJson(`${platformUrl}/api/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Delegating Text Broker Agent',
        description: 'A demo broker agent that accepts parent text requests, creates delegated child tasks, hires the text processor agent, and verifies the downstream result before closing the parent task.',
        offerDescription: '# 🧭 Delegating Text Broker\n\nI accept higher-level text requests and route the specialist step through Wuselverse using delegated child tasks.\n\nFor the Phase 3 demo I specifically subcontract the existing Text Processor Agent and return the verified final result.',
        userManual: '# Delegating Text Broker Agent\n\n## Demo capabilities\n- `delegated-text-workflow`\n- `text-broker`\n- `task-delegation`\n\nPost a parent task requesting one of those capabilities plus `metadata.input.text` and `metadata.input.operation`.\nThe broker agent will create a child task, wait for the text processor to deliver, verify the child work, and then complete the parent delivery.',
        capabilities: ['delegated-text-workflow', 'text-broker', 'task-delegation'],
        owner: ownerSession.user?.email || 'demo.user@example.com',
        pricing: {
          type: 'fixed',
          amount: 12,
          currency: 'USD',
        },
        mcpEndpoint: `http://localhost:${mcpPort}/mcp`,
      }),
    }, ownerSession);

    const agentId = registration?.data?._id || registration?.data?.id || 'unknown';
    const apiKey = registration?.apiKey || '';
    const status = registration?.data?.status || 'unknown';

    console.log('✓ Broker agent registered successfully');
    console.log(`  Agent ID: ${agentId}`);
    console.log(`  Status: ${status}`);
    console.log(`  API Key: ${apiKey ? `${apiKey.substring(0, 20)}...` : 'not returned'}`);

    if (status !== 'active') {
      console.warn(`⚠ Agent status is '${status}'. For local demos, start the backend with ALLOW_PRIVATE_MCP_ENDPOINTS=true.`);
    }

    console.log('\n[3/4] Creating broker agent instance...');
    const agent = new DelegatingTextBrokerAgent({
      platformUrl,
      mcpPort,
      agentId,
      apiKey,
    });
    console.log('✓ Broker agent instance created');

    console.log('\n[4/4] Starting MCP server...');
    const server = new AgentHttpServer(agent, {
      name: 'Delegating Text Broker Agent',
      capabilities: ['delegated-text-workflow', 'text-broker', 'task-delegation'],
      mcpPort,
      platformUrl,
    });

    await server.start();

    console.log(`✓ MCP server started on port ${mcpPort}`);
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║  🎉 Broker Agent Ready! Waiting for parent tasks...         ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    console.log('Run these in separate terminals for the full delegation demo:');
    console.log('  • npm run demo:agent         # existing text processor agent');
    console.log('  • npm run demo:delegation    # new brokered parent → child flow');
    console.log('\nPress Ctrl+C to stop\n');
  } catch (error) {
    console.error('\n❌ Failed to start broker agent:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down broker agent gracefully...');
  process.exit(0);
});

main().catch(console.error);

export default DelegatingTextBrokerAgent;
