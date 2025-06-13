/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  transformIgnorePatterns: [ // Updated line
    "/node_modules/(?!(@google/genai)/)"
  ],
  moduleNameMapper: {
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
    '^@hooks/(.*)$': '<rootDir>/hooks/$1'
  }
};
