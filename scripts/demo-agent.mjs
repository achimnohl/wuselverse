#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';

const workspaceRoot = process.cwd();
const agentDir = path.join(workspaceRoot, 'examples', 'text-processor-agent');
const isWindows = process.platform === 'win32';
const platformUrl = process.env.PLATFORM_URL || 'http://localhost:3000';
const mcpPort = process.env.MCP_PORT || '3003';
const publicMcpEndpoint = process.env.PUBLIC_MCP_ENDPOINT || `http://localhost:${mcpPort}/mcp`;
const demoOwnerEmail = process.env.DEMO_OWNER_EMAIL || 'demo.user@example.com';

console.log('[demo:agent] Launching the text processor demo agent...');
console.log(`[demo:agent] Platform: ${platformUrl}`);
console.log(`[demo:agent] MCP endpoint: ${publicMcpEndpoint}`);
console.log(`[demo:agent] Owner auth: session-backed bootstrap as ${demoOwnerEmail}`);

const child = spawn('npm', ['start'], {
  cwd: agentDir,
  stdio: 'inherit',
  // On Windows, npm is launched via a shell-backed shim rather than as a direct executable.
  shell: isWindows,
  env: {
    ...process.env,
    PLATFORM_URL: platformUrl,
    MCP_PORT: mcpPort,
    PUBLIC_MCP_ENDPOINT: publicMcpEndpoint,
    DEMO_OWNER_EMAIL: demoOwnerEmail,
    DEMO_OWNER_PASSWORD: process.env.DEMO_OWNER_PASSWORD || 'demodemo',
    DEMO_OWNER_DISPLAY_NAME: process.env.DEMO_OWNER_DISPLAY_NAME || 'Demo User',
  },
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error(`Failed to start demo agent: ${error.message}`);
  process.exit(1);
});
