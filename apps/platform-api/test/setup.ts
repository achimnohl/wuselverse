/**
 * E2E Test Setup
 * Loads test environment variables before tests run
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.test file
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

console.log('[E2E Setup] Test environment loaded');
console.log('[E2E Setup] MongoDB URI:', process.env.MONGODB_URI);
console.log('[E2E Setup] Platform API Key:', process.env.PLATFORM_API_KEY ? '***' : 'NOT SET');
console.log('[E2E Setup] Port:', process.env.PORT);
