/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  transformIgnorePatterns: [
    "node_modules/(?!(@google/genai|another-es-module-package)/)"
  ],
};
