import { WuselverseAgent, AgentHttpServer } from '../../dist/packages/agent-sdk/src/index.js';

type DemoSession = {
  cookies: Map<string, string>;
  csrfToken: string | null;
  user: { id?: string; email?: string; displayName?: string } | null;
};

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

/**
 * Simple text processing agent for demos
 * Performs instant text operations: reverse, word count, case conversion
 */
class TextProcessorAgent extends WuselverseAgent {
  async evaluateTask(task: any): Promise<any> {
    console.log(`[TextProcessor] Evaluating task: ${task.title}`);
    
    // Check if task matches our capabilities
    const ourCapabilities = ['text-reverse', 'word-count', 'case-convert'];
    const requestedCapabilities = task.requirements?.capabilities || task.requirements?.skills || [];
    const matches = requestedCapabilities.some((cap: string) => 
      ourCapabilities.includes(cap)
    );
    
    if (!matches) {
      console.log('[TextProcessor] No matching capabilities, declining task');
      return { interested: false };
    }
    
    // Bid low since it's instant work (under 1 second)
    console.log('[TextProcessor] Submitting bid: $5 USD');
    return {
      interested: true,
      proposedAmount: 5,
      estimatedDuration: 1, // 1 second
      proposal: 'I can process this text instantly! Specializing in reversing, word counting, and case conversion.'
    };
  }
  
  async executeTask(taskId: string, details: any): Promise<any> {
    console.log(`[TextProcessor] Executing task: ${taskId}`);
    
    const input = details.input || details.metadata?.input || {};
    const inputText = input.text || 'Hello World';
    const operation = input.operation || 'reverse';
    
    console.log(`[TextProcessor] Operation: ${operation}`);
    console.log(`[TextProcessor] Input: "${inputText}"`);
    
    let result: string;
    
    switch (operation) {
      case 'reverse':
        result = inputText.split('').reverse().join('');
        break;
      case 'word-count':
        const wordCount = inputText.split(/\s+/).filter((w: string) => w.length > 0).length;
        result = `Word count: ${wordCount}`;
        break;
      case 'uppercase':
        result = inputText.toUpperCase();
        break;
      case 'lowercase':
        result = inputText.toLowerCase();
        break;
      default:
        console.log(`[TextProcessor] Unknown operation "${operation}", defaulting to reverse`);
        result = inputText.split('').reverse().join('');
    }
    
    console.log(`[TextProcessor] Result: "${result}"`);
    
    return {
      success: true,
      output: {
        original: inputText,
        operation: operation,
        result: result,
        executedAt: new Date().toISOString()
      }
    };
  }
}

/**
 * Main entry point
 */
async function main() {
  const platformUrl = process.env.PLATFORM_URL || 'http://localhost:3000';
  const mcpPort = parseInt(process.env.PORT || process.env.MCP_PORT || '3002', 10);
  const publicMcpEndpoint = process.env.PUBLIC_MCP_ENDPOINT || `http://localhost:${mcpPort}/mcp`;
  
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║   Text Processor Agent for Wuselverse Demo    ║');
  console.log('╚════════════════════════════════════════════════╝');
  console.log(`\nPlatform: ${platformUrl}`);
  console.log(`MCP Port: ${mcpPort}`);
  console.log(`Public MCP Endpoint: ${publicMcpEndpoint}\n`);
  
  try {
    console.log('[1/4] Signing in demo owner...');
    const ownerSession = await ensureDemoOwnerSession(platformUrl);
    console.log(`✓ Demo owner ready: ${ownerSession.user?.displayName || ownerSession.user?.email || 'demo user'}`);

    console.log('\n[2/4] Registering agent with platform...');

    const registration: any = await requestJson(`${platformUrl}/api/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Text Processor Agent',
        description: 'Lightning-fast text manipulation: reverse, word count, case conversion. Perfect for demos!',
        offerDescription: '# 🚀 Text Processing Expert\n\nInstant text operations:\n- **Reverse** - Flip text backwards\n- **Word Count** - Count words in text\n- **Case Convert** - Upper/lowercase conversion\n\n⚡ Average execution: <1 second',
        userManual: '# Text Processor Agent\n\n## Usage\n\nInclude one of these capabilities in your task:\n- `text-reverse` - Reverse text\n- `word-count` - Count words\n- `case-convert` - Change case',
        capabilities: ['text-reverse', 'word-count', 'case-convert'],
        owner: ownerSession.user?.email || 'demo.user@example.com',
        pricing: {
          type: 'fixed',
          amount: 5,
          currency: 'USD'
        },
        mcpEndpoint: publicMcpEndpoint
      })
    }, ownerSession);

    const agentId = registration?.data?._id || registration?.data?.id || 'unknown';
    const apiKey = registration?.apiKey || '';
    const status = registration?.data?.status || 'unknown';

    console.log(`✓ Registered successfully!`);
    console.log(`  Agent ID: ${agentId}`);
    console.log(`  Status: ${status}`);
    console.log(`  API Key: ${apiKey ? `${apiKey.substring(0, 20)}...` : 'not returned'}`);

    if (status !== 'active') {
      console.warn(`⚠ Agent status is '${status}'. For local demos, ensure the backend was started with ALLOW_PRIVATE_MCP_ENDPOINTS=true.`);
    }

    if (apiKey) {
      process.env.AGENT_API_KEY = apiKey;
    }
    
    console.log('\n[3/4] Creating agent instance...');
    
    // Create agent instance
    const agent = new TextProcessorAgent({
      name: 'Text Processor Agent',
      capabilities: ['text-reverse', 'word-count', 'case-convert'],
      mcpPort,
      platformUrl,
      apiKey,
    });
    
    console.log('✓ Agent instance created');
    
    console.log('\n[4/4] Starting MCP server...');
    
    // Start HTTP server for MCP
    const server = new AgentHttpServer(agent, {
      name: 'Text Processor Agent',
      capabilities: ['text-reverse', 'word-count', 'case-convert'],
      mcpPort,
      platformUrl
    });
    
    await server.start();
    
    console.log(`✓ MCP server started on port ${mcpPort}`);
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║  🎉 Agent Ready! Waiting for tasks...         ║');
    console.log('╚════════════════════════════════════════════════╝\n');
    console.log('Available capabilities:');
    console.log('  • text-reverse   - Reverse text strings');
    console.log('  • word-count     - Count words in text');
    console.log('  • case-convert   - Upper/lowercase conversion');
    console.log('\nPress Ctrl+C to stop\n');
    
  } catch (error) {
    console.error('\n❌ Failed to start agent:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down gracefully...');
  process.exit(0);
});

main().catch(console.error);

export default TextProcessorAgent;