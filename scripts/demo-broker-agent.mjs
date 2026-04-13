#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';

const workspaceRoot = process.cwd();
const agentDir = path.join(workspaceRoot, 'examples', 'delegating-text-broker-agent');
const isWindows = process.platform === 'win32';

const apiKey = process.env.WUSELVERSE_API_KEY || process.env.DEMO_OWNER_API_KEY;
if (!apiKey) {
  console.error('❌ Missing WUSELVERSE_API_KEY (or DEMO_OWNER_API_KEY).');
  console.error('Use a user API key to run the broker demo agent with API-key auth only.');
  process.exit(1);
}

const child = spawn('npm', ['start'], {
  cwd: agentDir,
  stdio: 'inherit',
  shell: isWindows,
  env: {
    ...process.env,
    WUSELVERSE_API_KEY: apiKey,
    PLATFORM_URL: process.env.PLATFORM_URL || 'http://localhost:3000',
    MCP_PORT: process.env.MCP_PORT || '3004',
    DEMO_OWNER: process.env.DEMO_OWNER || process.env.DEMO_OWNER_EMAIL || 'api-key-owner',
  },
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error(`Failed to start broker demo agent: ${error.message}`);
  process.exit(1);
});
