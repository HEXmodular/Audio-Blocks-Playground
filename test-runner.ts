// Placeholder for test-runner.ts
// Used to resolve import in services/geminiService.ts

export const testRegistry = {
  // Add a dummy expect function to match usage in geminiService.ts
  expect: (() => {
    // This is a dummy implementation.
    // In a real test environment, this would be Jest's expect or similar.
    const self: any = (_actual: any) => ({
      toBe: (_expected: any) => {},
      toEqual: (_expected: any) => {},
      toBeTruthy: () => {},
      toBeFalsy: () => {},
      toBeNull: () => {},
      toBeUndefined: () => {},
      toBeDefined: () => {},
      toBeNaN: () => {},
      toBeInstanceOf: (_expected: any) => {},
      toMatch: (_expected: any) => {},
      toMatchObject: (_expected: any) => {},
      toContain: (_expected: any) => {},
      toHaveLength: (_expected: any) => {},
      toHaveProperty: (_expected: any, _value?: any) => {},
      toThrow: (_expected?: any) => {},
      toThrowError: (_expected?: any) => {},
      // Add any other matchers that might be used by AI-generated tests if necessary
    });
    // Allow expect to be called with no arguments (e.g. expect.assertions(1))
    // or with arguments for specific matchers like expect.extend({})
    Object.assign(self, {
        assertions: (_count: number) => {},
        extend: (_matchers: object) => {},
        // Add other static methods of 'expect' if needed
    });
    return self;
  })()
};
