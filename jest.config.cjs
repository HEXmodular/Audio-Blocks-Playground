/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest', // ts-jest still needed for .ts files
  testEnvironment: 'jsdom',
  transform: {
    // Use ts-jest for .ts and .tsx files
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      // Removed useESM: true; rely on Babel for CJS conversion for Jest
      tsconfig: 'tsconfig.json' // Explicitly point to tsconfig
    }],
    // Use babel-jest for .js, .jsx, and .mjs files, especially from node_modules
    '^.+\\.(js|jsx|mjs)$': 'babel-jest',
  },
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'], // Only run .ts test files
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node', 'mjs'],
  // Attempt to transform all of node_modules, then specifically allow 'tone'
  // This is broad, but can help identify if the ignore pattern is too aggressive.
  // A more common pattern is to NOT transform node_modules, EXCEPT for specific ESM modules.
  // For now, let's try ensuring 'tone' is definitely transformed.
  transformIgnorePatterns: [
    '/node_modules/(?!tone|standardized-audio-context)', // Ensure tone and standardized-audio-context are NOT ignored by transformers
    // If other ESM packages cause issues, add them here: /node_modules/(?!tone|other-module|another-module)
  ],
  moduleNameMapper: {
    // Specific mocks - ensure these are listed before generic paths
    '^@services/AudioContextService$': '<rootDir>/__mocks__/AudioContextService.js', // Assuming mock file exists or will be created
    '^@services/AudioNodeCreator$': '<rootDir>/__mocks__/AudioNodeCreator.js', // Assuming mock file exists or will be created
    '^@services/AudioWorkletManager$': '<rootDir>/__mocks__/AudioWorkletManager.js',
    '^@services/LyriaServiceManager$': '<rootDir>/__mocks__/LyriaServiceManager.js', // Assuming mock file exists or will be created
    '^@services/AudioGraphConnectorService$': '<rootDir>/__mocks__/AudioGraphConnectorService.js', // Assuming mock file exists or will be created
    // '^@google/genai$': '<rootDir>/__mocks__/@google/genai.js',
    // Standard path mappings
    '^@/(.*)$': '<rootDir>/$1',
    '^@services/(.*)$': '<rootDir>/services/$1', // Generic services path
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
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts']
};
