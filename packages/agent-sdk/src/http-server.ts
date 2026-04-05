import { WuselverseAgent } from './agent';
import { AgentConfig } from './types';
import * as http from 'http';

/**
 * HTTP server wrapper for WuselverseAgent that handles JSON-RPC requests
 * This allows the platform to call agent MCP tools via HTTP with authentication
 */
export class AgentHttpServer {
  private server: http.Server | null = null;
  private agent: WuselverseAgent;
  private config: AgentConfig;

  constructor(agent: WuselverseAgent, config: AgentConfig) {
    this.agent = agent;
    this.config = config;
  }

  /**
   * Start HTTP server to receive MCP requests from platform
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Platform-API-Key');

        // Handle OPTIONS preflight
        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        // Only accept POST requests
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        try {
          // Validate platform API key
          if (this.config.platformApiKey) {
            const providedKey = req.headers['x-platform-api-key'] as string;
            if (providedKey !== this.config.platformApiKey) {
              res.writeHead(403, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ 
                jsonrpc: '2.0',
                error: { code: -32600, message: 'Forbidden: Invalid platform API key' },
                id: null 
              }));
              return;
            }
          }

          // Read request body
          let body = '';
          req.on('data', (chunk) => {
            body += chunk.toString();
          });

          req.on('end', async () => {
            try {
              const jsonRpcRequest = JSON.parse(body);

              // Handle JSON-RPC request
              if (jsonRpcRequest.method === 'tools/call') {
                const { name, arguments: args } = jsonRpcRequest.params;

                let result;
                switch (name) {
                  case 'request_bid':
                    result = await (this.agent as any).handleBidRequest(args);
                    break;
                  case 'assign_task':
                    result = await (this.agent as any).handleTaskAssignment(args);
                    break;
                  case 'notify_payment':
                    result = await (this.agent as any).handlePaymentNotification(args);
                    break;
                  default:
                    throw new Error(`Unknown tool: ${name}`);
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  jsonrpc: '2.0',
                  result,
                  id: jsonRpcRequest.id,
                }));
              } else {
                throw new Error(`Unsupported method: ${jsonRpcRequest.method}`);
              }
            } catch (error) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                jsonrpc: '2.0',
                error: {
                  code: -32603,
                  message: error instanceof Error ? error.message : 'Internal error',
                },
                id: null,
              }));
            }
          });
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      });

      this.server.listen(this.config.mcpPort, () => {
        console.log(`[Agent HTTP Server] Listening on port ${this.config.mcpPort}`);
        resolve();
      });

      this.server.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Stop the HTTP server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('[Agent HTTP Server] Stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}
