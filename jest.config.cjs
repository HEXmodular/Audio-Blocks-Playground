/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { useESM: true }], // ts-jest for ts/tsx
    '^.+\\.(js|jsx)$': 'babel-jest', // babel-jest for js/jsx
    '^.+\\.mjs$': 'babel-jest', // babel-jest for mjs
  },
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts', '**/*.container.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node', 'mjs'],
  transformIgnorePatterns: [
    "/node_modules/(?!tone/)" // Ensure 'tone' and its submodules are transformed
  ],
  moduleNameMapper: {
    '^@google/genai$': '<rootDir>/__mocks__/@google/genai.js', // Mock @google/genai
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
    '^@services/AudioWorkletManager$': '<rootDir>/__mocks__/AudioWorkletManager.js',
    '^tone$': '<rootDir>/node_modules/tone/build/esm/index.js' // Added to ensure tone resolves correctly
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'] // Added setup file
};
