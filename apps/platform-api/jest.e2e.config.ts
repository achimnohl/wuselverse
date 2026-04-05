import type { Config } from 'jest';

const config: Config = {
  displayName: 'platform-api-e2e',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
  transform: {
    '^.+\\.[tj]s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
      },
    ],
  },
  moduleNameMapper: {
    '^@wuselverse/contracts$': '<rootDir>/../../packages/contracts/src/index.ts',
    '^@wuselverse/agent-registry$': '<rootDir>/../../packages/agent-registry/src/index.ts',
    '^@wuselverse/marketplace$': '<rootDir>/../../packages/marketplace/src/index.ts',
    '^@wuselverse/crud-framework$': '<rootDir>/../../packages/crud-framework/src/index.ts',
    '^@wuselverse/agent-sdk$': '<rootDir>/../../packages/agent-sdk/src/index.ts',
  },
  moduleFileExtensions: ['ts', 'js', 'html', 'json'],
  coverageDirectory: '../../coverage/apps/platform-api-e2e',
  testTimeout: 30000,
  maxWorkers: 1, // Run tests sequentially to avoid port conflicts
  forceExit: true, // Force exit after tests complete
  detectOpenHandles: true, // Detect open handles to help with cleanup
};

export default config;
