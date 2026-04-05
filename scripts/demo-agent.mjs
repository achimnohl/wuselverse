#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';

const workspaceRoot = process.cwd();
const agentDir = path.join(workspaceRoot, 'examples', 'text-processor-agent');
const isWindows = process.platform === 'win32';

const child = spawn('npm', ['start'], {
  cwd: agentDir,
  stdio: 'inherit',
  // On Windows, npm is launched via a shell-backed shim rather than as a direct executable.
  shell: isWindows,
  env: {
    ...process.env,
    PLATFORM_URL: process.env.PLATFORM_URL || 'http://localhost:3000',
    MCP_PORT: process.env.MCP_PORT || '3003',
  },
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error(`Failed to start demo agent: ${error.message}`);
  process.exit(1);
});
