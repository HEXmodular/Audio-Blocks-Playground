// test-runner.ts

interface TestResult {
  suiteName: string;
  testName: string;
  passed: boolean;
  error?: Error;
  duration: number;
}

interface Suite {
  name: string;
  tests: { name: string; fn: () => void | Promise<void> }[];
  beforeAlls: Array<() => void | Promise<void>>;
  beforeEachs: Array<() => void | Promise<void>>;
  afterEachs: Array<() => void | Promise<void>>;
  afterAlls: Array<() => void | Promise<void>>;
  results: TestResult[]; // For collecting results within the suite
}

export type LogFn = (message: string, type: 'info' | 'pass' | 'fail' | 'suite' | 'summary' | 'hookError' | 'healthCheck') => void;

class TestRegistry {
  public suites: Suite[] = [];
  private currentSuiteContext: Suite | null = null;
  private currentTestError: Error | null = null;

  public describe = (name: string, suiteFn: () => void) => {
    const newSuite: Suite = {
      name,
      tests: [],
      beforeAlls: [],
      beforeEachs: [],
      afterEachs: [],
      afterAlls: [],
      results: [],
    };
    this.suites.push(newSuite);
    this.currentSuiteContext = newSuite;
    try {
      suiteFn(); // This will call it(), beforeEach(), etc.
    } catch(e: any) {
        console.error(`Error during describe block for "${name}": ${e.message}`);
        // Optionally log this to the test output as a general suite error
    }
    this.currentSuiteContext = null;
  }

  private addHook = (type: 'beforeAlls' | 'beforeEachs' | 'afterEachs' | 'afterAlls', fn: () => void | Promise<void>) => {
    if (!this.currentSuiteContext) {
      // This can happen if a hook is defined outside a describe block, which is a user error.
      const errMsg = `Hook function ${type} must be called within a describe block.`;
      this.currentTestError = new Error(errMsg); // Store error to be thrown by expect()
      console.error(errMsg); // Also log to console for immediate feedback
      return; // Allow test definition to continue, error will surface in expect()
    }
    this.currentSuiteContext[type].push(fn);
  }

  public beforeAll = (fn: () => void | Promise<void>) => { this.addHook('beforeAlls', fn); }
  public beforeEach = (fn: () => void | Promise<void>) => { this.addHook('beforeEachs', fn); }
  public afterEach = (fn: () => void | Promise<void>) => { this.addHook('afterEachs', fn); }
  public afterAll = (fn: () => void | Promise<void>) => { this.addHook('afterAlls', fn); }

  public it = (name: string, testFn: () => void | Promise<void>) => {
    if (!this.currentSuiteContext) {
      const errMsg = `it("${name}") must be called within a describe block.`;
      this.currentTestError = new Error(errMsg);
      console.error(errMsg);
      return; 
    }
    this.currentSuiteContext.tests.push({ name, fn: testFn });
  }

  public expect = (actual: any) => {
    if (this.currentTestError) {
        const errToThrow = this.currentTestError;
        this.currentTestError = null; // Clear error after throwing
        throw errToThrow;
    }

    const buildFailureMessage = (matcherName: string, expected?: any, received?: any, customMessage?: string) => {
      let message = `ExpectationFailed: Expected ${matcherName}.`;
      if (customMessage) message += ` ${customMessage}.`;
      
      const formatValue = (val: any) => {
        if (typeof val === 'string') return `"${val}"`;
        if (typeof val === 'function') return val.name ? `Function ${val.name}` : 'Anonymous function';
        if (val instanceof RegExp) return val.toString();
        try {
          return JSON.stringify(val);
        } catch {
          return Object.prototype.toString.call(val);
        }
      };

      if (expected !== undefined) message += ` Expected: ${formatValue(expected)}.`;
      if (received !== undefined) message += ` Received: ${formatValue(received)}.`; // 'received' is 'actual' here
      return message;
    };
    
    const deepEqual = (obj1: any, obj2: any): boolean => {
        if (obj1 === obj2) return true; // Handles primitives, null, undefined, and same object instances
        if (obj1 instanceof Date && obj2 instanceof Date) return obj1.getTime() === obj2.getTime();
        if (obj1 instanceof RegExp && obj2 instanceof RegExp) return obj1.source === obj2.source && obj1.flags === obj2.flags;
        if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null) {
            return false;
        }
        const keys1 = Object.keys(obj1);
        const keys2 = Object.keys(obj2);
        if (keys1.length !== keys2.length) return false;
        for (const key of keys1) {
            if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) {
            return false;
            }
        }
        return true;
    };

    let isInverted = false;

    const check = (passed: boolean, matcherName: string, expected?: any, customMessage?: string) => {
      const effectivePassed = isInverted ? !passed : passed;
      if (!effectivePassed) {
        throw new Error(buildFailureMessage(isInverted ? `NOT ${matcherName}` : matcherName, expected, actual, customMessage));
      }
    };

    const matchers = {
      toBe: (expected: any) => check(actual === expected, 'toBe', expected),
      toEqual: (expected: any) => check(deepEqual(actual, expected), 'toEqual', expected),
      toBeTruthy: () => check(!!actual, 'toBeTruthy'),
      toBeFalsy: () => check(!actual, 'toBeFalsy'),
      toContain: (item: any) => {
        if (Array.isArray(actual)) {
          check(actual.some(element => deepEqual(element, item)), 'toContain in array', item);
        } else if (typeof actual === 'string') {
          check(actual.includes(item), 'toContain in string', item);
        } else {
          throw new Error('ExpectationFailed: toContain matcher can only be used on arrays or strings.');
        }
      },
      toThrow: (expectedMessage?: string | RegExp) => {
        if (typeof actual !== 'function') {
          throw new Error('ExpectationFailed: toThrow matcher must be used with a function.');
        }
        let threw = false;
        let threwError: any;
        try {
          actual();
        } catch (e: any) {
          threw = true;
          threwError = e;
        }

        if (!threw) {
          check(false, 'toThrow (function did not throw)');
          return; 
        }
        
        // If it threw, and no specific message, it's a pass for .toThrow()
        if (!expectedMessage) {
            check(true, 'toThrow (function threw as expected)');
            return;
        }

        // If specific message/regex, check that
        if (typeof expectedMessage === 'string') {
          check(threwError.message.includes(expectedMessage), 'toThrow with message', expectedMessage, `Actual message: "${threwError.message}"`);
        } else if (expectedMessage instanceof RegExp) {
          check(expectedMessage.test(threwError.message), 'toThrow with regex', expectedMessage.source, `Actual message: "${threwError.message}"`);
        }
      },
      toBeInstanceOf: (constructor: any) => check(actual instanceof constructor, 'toBeInstanceOf', constructor.name),
      toBeNull: () => check(actual === null, 'toBeNull'),
      toBeUndefined: () => check(actual === undefined, 'toBeUndefined'),
      toBeDefined: () => check(actual !== undefined, 'toBeDefined'),
      toBeGreaterThan: (num: number) => {
        if (typeof actual !== 'number') throw new Error('ExpectationFailed: toBeGreaterThan actual value must be a number.');
        check(actual > num, 'toBeGreaterThan', num);
      },
      toBeLessThan: (num: number) => {
        if (typeof actual !== 'number') throw new Error('ExpectationFailed: toBeLessThan actual value must be a number.');
        check(actual < num, 'toBeLessThan', num);
      },
      toHaveLength: (length: number) => {
        if (!actual || typeof actual.length !== 'number') throw new Error('ExpectationFailed: toHaveLength actual value must have a length property (e.g. array, string).');
        check(actual.length === length, 'toHaveLength', length);
      },
      toMatchObject: (expectedPartial: object) => {
        if (typeof actual !== 'object' || actual === null || typeof expectedPartial !== 'object' || expectedPartial === null) {
            throw new Error('ExpectationFailed: toMatchObject requires both actual and expected to be objects.');
        }
        const checkSubset = (subset: any, superset: any): boolean => {
            return Object.keys(subset).every(key => {
                const subsetValue = subset[key];
                const supersetValue = superset[key];
                if (typeof subsetValue === 'object' && subsetValue !== null && typeof supersetValue === 'object' && supersetValue !== null) {
                    return checkSubset(subsetValue, supersetValue);
                }
                return deepEqual(subsetValue, supersetValue);
            });
        };
        check(checkSubset(expectedPartial, actual), 'toMatchObject', expectedPartial);
      }
    };
    
    const chainedMatchers: any = {};
    for (const key in matchers) {
        chainedMatchers[key] = (...args: any[]) => {
            (matchers as any)[key](...args);
            isInverted = false; // Reset inversion after a matcher is called
        };
    }
    
    chainedMatchers.not = new Proxy({}, {
        get: (target, propKey, receiver) => {
            if (propKey in matchers) {
                isInverted = true;
                return (...args: any[]) => {
                    (matchers as any)[propKey](...args); // Call original matcher, check() handles inversion
                    isInverted = false; // Reset inversion
                };
            }
            return Reflect.get(target, propKey, receiver);
        }
    });

    return chainedMatchers;
  }
}

export const testRegistry = new TestRegistry();
// Make describe, it, etc. globally available for test files if they import this module.
// These are now arrow functions on the testRegistry instance, so 'this' will be correctly bound.
export const { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } = testRegistry;

export async function runTests(logFn: LogFn): Promise<{ total: number, passed: number, failed: number, duration: number }> {
  logFn('Starting test run...', 'info');
  let totalTests = 0;
  let passedTests = 0;
  const overallStartTime = performance.now();

  // Ensure testRegistry and testRegistry.suites are defined before trying to iterate
  if (!testRegistry) {
    logFn('CRITICAL ERROR: testRegistry object is undefined in runTests.', 'fail');
    return { total: 0, passed: 0, failed: 0, duration: performance.now() - overallStartTime };
  }
  if (!testRegistry.suites) {
    logFn('CRITICAL ERROR: testRegistry.suites is undefined in runTests.', 'fail');
    // This case should be less likely if testRegistry itself is fine and class initializes suites.
    return { total: totalTests, passed: passedTests, failed: totalTests - passedTests, duration: performance.now() - overallStartTime };
  }


  for (const suite of testRegistry.suites) {
    logFn(`\nSUITE: ${suite.name}`, 'suite');
    suite.results = []; // Clear previous results for this suite

    const runHooks = async (hooks: Array<() => void | Promise<void>>, hookType: string, testName?: string) => {
        for (const hook of hooks) {
            try {
                await hook();
            } catch (e: any) {
                const context = testName ? `test ${testName}` : `suite ${suite.name}`;
                logFn(`Error in ${hookType} for ${context}: ${e.message}`, 'hookError');
                throw e; // Propagate to stop suite/test execution
            }
        }
    };
    
    let suiteSetupError = false;
    try {
        await runHooks(suite.beforeAlls, 'beforeAll');
    } catch (e) {
        suiteSetupError = true;
    }

    if (!suiteSetupError) {
        for (const test of suite.tests) {
          totalTests++;
          const testStartTime = performance.now();
          let testPassed = false;
          let testError: Error | undefined;
          let beforeEachError = false;

          try {
            await runHooks(suite.beforeEachs, 'beforeEach', test.name);
          } catch(e: any) {
              beforeEachError = true;
              testError = e;
              logFn(`  FAIL: ${test.name} (due to beforeEach error: ${e.message})`, 'fail');
          }

          if (!beforeEachError) {
            try {
              await test.fn();
              testPassed = true;
              logFn(`  PASS: ${test.name}`, 'pass');
            } catch (e: any) {
              testError = e;
              logFn(`  FAIL: ${test.name} - ${e.message}`, 'fail');
            }
          }

          try {
            await runHooks(suite.afterEachs, 'afterEach', test.name);
          } catch (e: any) {
              logFn(`Error in afterEach for test ${test.name}: ${e.message}`, 'hookError');
              if (testPassed && !beforeEachError) { 
                  testPassed = false;
                  testError = e; 
                  logFn(`  FAIL (due to afterEach): ${test.name} - ${e.message}`, 'fail');
              } else if (!testError) { // If beforeEach failed, this is an additional error.
                  testError = e; // Store this error if no primary test error.
              }
          }

          const testEndTime = performance.now();
          const result: TestResult = {
            suiteName: suite.name,
            testName: test.name,
            passed: testPassed,
            error: testError,
            duration: testEndTime - testStartTime,
          };
          suite.results.push(result);
          if (testPassed) passedTests++;
        }
    } else {
        // If beforeAll failed, mark all tests in suite as failed conceptually
        suite.tests.forEach(test => {
            totalTests++;
            const result: TestResult = {
                suiteName: suite.name,
                testName: test.name,
                passed: false,
                error: new Error(`Skipped due to beforeAll failure in suite "${suite.name}"`),
                duration: 0,
            };
            suite.results.push(result);
            logFn(`  FAIL: ${test.name} (Skipped due to beforeAll failure)`, 'fail');
        });
    }

    try {
        await runHooks(suite.afterAlls, 'afterAll');
    } catch(e) {
        logFn(`Error in afterAll for suite ${suite.name}: ${e.message}`, 'hookError');
    }
  }

  const overallEndTime = performance.now();
  const totalDuration = overallEndTime - overallStartTime;

  logFn('\n--- Test Summary ---', 'summary');
  logFn(`Total tests: ${totalTests}`, 'summary');
  logFn(`Passed: ${passedTests}`, 'pass');
  logFn(`Failed: ${totalTests - passedTests}`, 'fail');
  logFn(`Duration: ${totalDuration.toFixed(2)}ms`, 'summary');

  return {
    total: totalTests,
    passed: passedTests,
    failed: totalTests - passedTests,
    duration: totalDuration,
  };
}