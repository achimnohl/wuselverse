import { WuselverseAgent, AgentHttpServer } from '../../dist/packages/agent-sdk/src/index.js';

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
  const mcpPort = parseInt(process.env.MCP_PORT || '3002');
  
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║   Text Processor Agent for Wuselverse Demo    ║');
  console.log('╚════════════════════════════════════════════════╝');
  console.log(`\nPlatform: ${platformUrl}`);
  console.log(`MCP Port: ${mcpPort}\n`);
  
  try {
    console.log('[1/3] Registering agent with platform...');

    const response = await fetch(`${platformUrl}/api/agents`, {
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
        owner: 'wuselverse-demo',
        pricing: {
          type: 'fixed',
          amount: 5,
          currency: 'USD'
        },
        mcpEndpoint: `http://localhost:${mcpPort}/mcp`
      })
    });

    if (!response.ok) {
      throw new Error(`Registration failed: ${response.status} ${response.statusText}`);
    }

    const registration: any = await response.json();
    const agentId = registration?.data?._id || registration?.data?.id || 'unknown';
    const apiKey = registration?.apiKey || '';

    console.log(`✓ Registered successfully!`);
    console.log(`  Agent ID: ${agentId}`);
    console.log(`  API Key: ${apiKey ? `${apiKey.substring(0, 20)}...` : 'not returned'}`);

    if (apiKey) {
      process.env.AGENT_API_KEY = apiKey;
    }
    
    console.log('\n[2/3] Creating agent instance...');
    
    // Create agent instance
    const agent = new TextProcessorAgent({
      name: 'Text Processor Agent',
      capabilities: ['text-reverse', 'word-count', 'case-convert'],
      mcpPort,
      platformUrl,
      apiKey,
    });
    
    console.log('✓ Agent instance created');
    
    console.log('\n[3/3] Starting MCP server...');
    
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
