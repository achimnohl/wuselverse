import type { Config } from 'jest';

const config: Config = {
  displayName: 'platform-api',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
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
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/platform-api',
};

export default config;
