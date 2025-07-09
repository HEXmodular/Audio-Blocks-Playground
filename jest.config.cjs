/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.(ts|tsx|mjs)$': ['ts-jest', { useESM: true }],
    '^.+\\.(js|jsx)$': 'babel-jest',
  },
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node', 'mjs'],
  transformIgnorePatterns: [
    "/node_modules/(?!tone)" // Simpler pattern: transpile tone, ignore others in node_modules
  ],
  moduleNameMapper: {
    // '^@google/genai$': '<rootDir>/__mocks__/@google/genai.js', // Ensure this is commented out
    // Standard path mappings
    '^@/(.*)$': '<rootDir>/$1',
    '^@services/(.*)$': '<rootDir>/services/$1',
    '^@interfaces/(.*)$': '<rootDir>/interfaces/$1',
    '^@components/(.*)$': '<rootDir>/components/$1',
    '^@context/(.*)$': '<rootDir>/context/$1',
    '^@utils/(.*)$': '<rootDir>/utils/$1',
    '^@controllers/(.*)$': '<rootDir>/controllers/$1',
    '^@icons/(.*)$': '<rootDir>/icons/$1',
    '^@constants/(.*)$': '<rootDir>/constants/$1',
    '^@state/(.*)$': '<rootDir>/state/$1',
    '^@hooks/(.*)$': '<rootDir>/hooks/$1',
    '^@blocks/(.*)$': '<rootDir>/blocks/$1',
    '^@services/AudioWorkletManager$': '<rootDir>/__mocks__/AudioWorkletManager.js'
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'] // Added setup file
};
