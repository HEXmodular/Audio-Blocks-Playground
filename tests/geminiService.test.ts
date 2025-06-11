
// Adjust the import path according to your project structure
import { parseJsonFromGeminiResponse } from '../services/geminiService';

// Mock @google/genai module
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn(),
    }),
  })),
}));

describe('geminiService - parseJsonFromGeminiResponse', () => {
  let originalConsoleError: typeof console.error;
  let originalConsoleWarn: typeof console.warn;

  beforeEach(() => {
    originalConsoleError = console.error;
    originalConsoleWarn = console.warn;
    // Suppress console.error for tests in this suite, as many are testing error paths
    // where parseJsonFromGeminiResponse logs an error before throwing.
    console.error = () => {}; 
    // Suppress console.warn for tests that might trigger salvage logic warnings,
    // unless a specific test needs to assert those warnings.
    console.warn = () => {};
  });

  afterEach(() => {
    console.error = originalConsoleError; // Restore console.error
    console.warn = originalConsoleWarn; // Restore console.warn
  });

  it('should parse a simple JSON string', () => {
    const jsonString = '{"name": "Test", "value": 123}';
    const result = parseJsonFromGeminiResponse(jsonString);
    expect(result).toEqual({ name: 'Test', value: 123 });
  });

  it('should parse JSON string wrapped in triple backticks', () => {
    const jsonString = '```\n{"name": "Wrapped", "type": "test"}\n```';
    const result = parseJsonFromGeminiResponse(jsonString);
    expect(result).toEqual({ name: 'Wrapped', type: 'test' });
  });

  it('should parse JSON string wrapped in triple backticks with "json" tag', () => {
    const jsonString = '```json\n{"id": "abc", "data": [1, 2, 3]}\n```';
    const result = parseJsonFromGeminiResponse(jsonString);
    expect(result).toEqual({ id: 'abc', data: [1, 2, 3] });
  });

  it('should handle leading/trailing whitespace', () => {
    const jsonString = '  \n  {"message": "   Trimmed   "}  \n  ';
    const result = parseJsonFromGeminiResponse(jsonString);
    expect(result).toEqual({ message: '   Trimmed   ' });
  });
  
  it('should parse JSON string with nested objects and arrays', () => {
    const jsonString = '{"user": {"id": 1, "roles": ["admin", "editor"]}, "status": "active"}';
    const result = parseJsonFromGeminiResponse(jsonString);
    expect(result).toEqual({ user: { id: 1, roles: ["admin", "editor"] }, status: "active" });
  });

  it('should throw an error for invalid JSON', () => {
    const invalidJsonString = '{"name": "Test", value: 123}'; // Missing quotes around value key
    expect(() => parseJsonFromGeminiResponse(invalidJsonString)).toThrow();
  });

  it('should throw an error for invalid JSON even when wrapped', () => {
    const invalidJsonString = '```json\n{"name": Test", "value": 123}\n```'; // Missing quote for Test value
     expect(() => parseJsonFromGeminiResponse(invalidJsonString)).toThrow();
  });

  it('should handle empty JSON object', () => {
    const jsonString = '{}';
    expect(parseJsonFromGeminiResponse(jsonString)).toEqual({});
  });
  
  it('should handle empty JSON array', () => {
    const jsonString = '[]';
    expect(parseJsonFromGeminiResponse(jsonString)).toEqual([]);
  });

  it('should parse JSON with various data types', () => {
    const jsonString = '{"str": "text", "num": 1.23, "boolTrue": true, "boolFalse": false, "nil": null, "arr": [1, "two"]}';
    expect(parseJsonFromGeminiResponse(jsonString)).toEqual({
      str: "text",
      num: 1.23,
      boolTrue: true,
      boolFalse: false,
      nil: null,
      arr: [1, "two"]
    });
  });
  
  it('should handle JSON string that is just a primitive (e.g. "null", though Gemini likely won\'t send this)', () => {
    // Gemini is expected to send an object, but testing parser robustness
    expect(parseJsonFromGeminiResponse('null')).toBe(null);
    expect(parseJsonFromGeminiResponse('true')).toBe(true);
    expect(parseJsonFromGeminiResponse('"string"')).toBe("string");
    expect(parseJsonFromGeminiResponse('123')).toBe(123);
  });
  
  it('should correctly parse JSON when markdown fence has extra spaces', () => {
    const jsonString = '``` json  \n{"id": "spaced_fence"}\n  ```  ';
    const result = parseJsonFromGeminiResponse(jsonString);
    expect(result).toEqual({ id: "spaced_fence" });
  });
  
  it('should salvage JSON with trailing non-whitespace characters by finding the end of the main object', () => {
    // Restore console.warn for this specific test if we want to see the salvage warning
    console.warn = originalConsoleWarn;
    const jsonString = '{"key": "value", "nested": {"num": 1}} some trailing text and junk';
    const result = parseJsonFromGeminiResponse(jsonString);
    expect(result).toEqual({key: "value", nested: {num: 1}});
    console.warn = () => {}; // Re-suppress for other tests
  });

  it('should salvage JSON array with trailing non-whitespace characters', () => {
    console.warn = originalConsoleWarn;
    const jsonString = '[{"id":1}, {"id":2}] trailing data';
    const result = parseJsonFromGeminiResponse(jsonString);
    expect(result).toEqual([{id:1}, {id:2}]);
    console.warn = () => {};
  });
  
  it('should salvage JSON from markdown with trailing data after the fence', () => {
    console.warn = originalConsoleWarn;
    const jsonString = '```json\n{"name": "Salvage Me"}\n```This should be ignored.';
    const result = parseJsonFromGeminiResponse(jsonString);
    expect(result).toEqual({ name: "Salvage Me" });
    console.warn = () => {};
  });

  it('should throw if salvage attempt still results in invalid JSON', () => {
    const jsonString = '{"key": "value" broken structure after this...';
    expect(() => parseJsonFromGeminiResponse(jsonString)).toThrow();
  });
  
  it('should handle empty string input by throwing error', () => {
    expect(() => parseJsonFromGeminiResponse('')).toThrow();
  });

  it('should handle string that is only whitespace by throwing error', () => {
    expect(() => parseJsonFromGeminiResponse('   \n\t  ')).toThrow();
  });
});
