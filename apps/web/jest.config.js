const nextJest = require('next/jest');

const createJestConfig = nextJest({ dir: __dirname });

const customJestConfig = {
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^next/navigation$': '<rootDir>/src/__mocks__/next/navigation.ts',
    '^next-themes$': '<rootDir>/src/__mocks__/next-themes.ts',
    '^recharts$': '<rootDir>/src/__mocks__/recharts.ts',
  },
  testPathIgnorePatterns: ['/node_modules/', '/.next/', '/src/__mocks__/', '/src/__tests__/test-utils'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
};

module.exports = createJestConfig(customJestConfig);
