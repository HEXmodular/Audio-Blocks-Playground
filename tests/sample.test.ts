describe('Sample Test Suite', () => {
  let count = 0;
  let suiteData: string | undefined;

  beforeAll(() => {
    // console.log('Sample Suite: Before All');
    suiteData = 'Initialized in beforeAll';
  });

  beforeEach(() => {
    // console.log('Sample Suite: Before Each');
    count = 0;
    expect(suiteData).toBe('Initialized in beforeAll');
  });

  it('should correctly perform addition', () => {
    count++;
    expect(1 + 1).toBe(2);
    expect(count).toBe(1);
  });

  it('should correctly perform subtraction (async)', async () => {
    await new Promise(resolve => setTimeout(resolve, 10)); // Simulate async
    count += 5;
    expect(5 - 2).toBe(3);
    expect(count).toBe(5);
  });
  
  it('should handle truthy and falsy assertions', () => {
    expect(true).toBeTruthy();
    expect(0).toBeFalsy();
    expect('').toBeFalsy();
    expect(null).toBeNull();
    expect(undefined).toBeUndefined();
    expect("hello").toBeDefined();
    expect({}).toBeDefined();
  });

  it('should handle .not modifier', () => {
    expect(1).not.toBe(2);
    expect(null).not.toBeTruthy();
    // An undefined variable is, by definition, not defined. So .not.toBeDefined() should pass.
    expect(undefined).not.toBeDefined();
    expect(true).not.toBeFalsy();
  });
  
  it('.not.toBeUndefined for a defined value should pass', () => {
    const myVar = "I am defined";
    expect(myVar).not.toBeUndefined(); 
  });
  
  it('.not.toBeDefined for an undefined value should pass', () => {
    let myUndefinedVar;
    expect(myUndefinedVar).not.toBeDefined();
  });


  it('should handle object equality with toEqual', () => {
    const objA = { a: 1, b: { c: 2 }, d: [1,2] };
    const objB = { a: 1, b: { c: 2 }, d: [1,2] };
    const objC = { a: 1, b: { c: 3 }, d: [1,2] };
    const objD = { a: 1, b: { c: 2 }, d: [1,3] };
    expect(objA).toEqual(objB);
    expect(objA).not.toEqual(objC);
    expect(objA).not.toEqual(objD);
  });
  
  it('should demonstrate a failing test for toEqual that is caught and asserted', () => {
    const objA = {name: "Test"};
    try {
        expect(objA).toEqual({name: "Different"}); // This line is intended to throw an ExpectationFailed error
    } catch (e: any) {
        // This test PASSES if the specific error from the above expect() is caught
        // and its message is verified.
        expect(e.message).toContain("expect(received).toEqual(expected)");
        return; 
    }
    // This line should only be reached if the expect() in the try block did NOT throw,
    // which would mean the test's premise (that it would throw) is wrong.
    throw new Error("toEqual expectation did not throw an error as expected by the test structure.");
  });

  it('should handle toThrow for exceptions', () => {
    const throwErrorFn = () => { throw new Error("Specific error!"); };
    const noThrowFn = () => { return 1; };

    expect(throwErrorFn).toThrow();
    expect(throwErrorFn).toThrow("Specific error!");
    expect(throwErrorFn).toThrow(/Specific/);
    
    expect(noThrowFn).not.toThrow();
  });

  it('should handle toContain for arrays and strings', () => {
    const arr = [1, { id: 2 }, 'hello'];
    const str = "hello world";
    expect(arr).toContain(1);
    expect(arr).toContainEqual({ id: 2 }); // Uses deepEqual for object comparison
    expect(arr).not.toContain(3);
    expect(str).toContain("world");
    expect(str).not.toContain("galaxy");
  });

  it('should handle toBeInstanceOf', () => {
    class MyClass {}
    const instance = new MyClass();
    expect(instance).toBeInstanceOf(MyClass);
    expect([]).toBeInstanceOf(Array);
    expect(new Date()).toBeInstanceOf(Date);
    expect(/regex/).toBeInstanceOf(RegExp);
    expect(instance).not.toBeInstanceOf(Array);
  });
  
  it('should handle numeric comparisons', () => {
    expect(5).toBeGreaterThan(4);
    expect(3).toBeLessThan(4);
    expect(5).not.toBeLessThan(4);
    expect(3).not.toBeGreaterThan(4);
  });

  it('should handle toHaveLength', () => {
    expect([1, 2, 3]).toHaveLength(3);
    expect("hello").toHaveLength(5);
    expect([]).toHaveLength(0);
    expect({ length: 3 } as any).toHaveLength(3); // Works for objects with length property
    expect([1,2]).not.toHaveLength(3);
  });
  
  it('should handle toMatchObject', () => {
    const obj = { a: 1, b: { c: 2, d: 3 }, e: 4 };
    expect(obj).toMatchObject({ a: 1 });
    expect(obj).toMatchObject({ b: { c: 2 } });
    expect(obj).toMatchObject({ a: 1, b: { c: 2, d: 3 } });
    expect(obj).not.toMatchObject({ a: 2 });
    expect(obj).not.toMatchObject({ b: { c: 5 } });
    expect(obj).not.toMatchObject({ f: 6 }); // Key not present
  });


  afterEach(() => {
    // console.log('Sample Suite: After Each, count:', count);
  });

  afterAll(() => {
    // console.log('Sample Suite: After All');
    suiteData = undefined;
  });
});

describe('Another Test Suite', () => {
    it('is a simple test in another suite', () => {
        expect(true).toBe(true);
    });

    it('will fail intentionally if uncommented', () => {
        // expect(1).toBe(2); // Uncomment to see a failure
    });
});

// Test hook error handling
describe('Suite with hook errors', () => {
    beforeAll(() => {
        // console.log("Hook error suite: beforeAll");
        // throw new Error("Intentional beforeAll error"); // Uncomment to test beforeAll error
    });
    beforeEach(() => {
        // console.log("Hook error suite: beforeEach");
        // throw new Error("Intentional beforeEach error"); // Uncomment to test beforeEach error
    });
    it('test 1 in suite with hook errors', () => {
        expect(true).toBe(true);
    });
    it('test 2 in suite with hook errors', () => {
        expect(1).toBe(1);
    });
    afterEach(() => {
        // console.log("Hook error suite: afterEach");
        // throw new Error("Intentional afterEach error"); // Uncomment to test afterEach error
    });
    afterAll(() => {
        // console.log("Hook error suite: afterAll");
        // throw new Error("Intentional afterAll error"); // Uncomment to test afterAll error
    });
});