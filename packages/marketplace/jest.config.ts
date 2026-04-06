import type { Config } from 'jest';

const config: Config = {
  displayName: 'marketplace',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
      },
    ],
  },
  moduleNameMapper: {
    '^@wuselverse/contracts$': '<rootDir>/../contracts/src/index.ts',
    '^@wuselverse/agent-registry$': '<rootDir>/../agent-registry/src/index.ts',
    '^@wuselverse/marketplace$': '<rootDir>/src/index.ts',
    '^@wuselverse/crud-framework$': '<rootDir>/../crud-framework/src/index.ts',
    '^@wuselverse/agent-sdk$': '<rootDir>/../agent-sdk/src/index.ts',
  },
  moduleFileExtensions: ['ts', 'js'],
  coverageDirectory: '../../coverage/packages/marketplace',
};

export default config;
