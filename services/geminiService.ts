

import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { BlockDefinition, GeminiRequest, BlockParameter } from '../types';
import { 
    GEMINI_SYSTEM_PROMPT_FOR_BLOCK_DEFINITION, 
    GEMINI_SYSTEM_PROMPT_FOR_CODE_MODIFICATION,
    GEMINI_SYSTEM_PROMPT_FOR_TEST_FIXING_LOGIC_CODE,
    GEMINI_SYSTEM_PROMPT_FOR_TEST_FIXING_TEST_CODE
} from '../constants';
// import { testRegistry } from '../test-runner'; // Assuming test-runner is one level up

const API_KEY = process.env.API_KEY;
let ai: GoogleGenAI | null = null;

if (!API_KEY) {
  console.warn("API_KEY environment variable not set. Gemini functionality will be disabled.");
} else {
  ai = new GoogleGenAI({ apiKey: API_KEY });
}

const MAX_GEMINI_CODE_FIX_ATTEMPTS = 2; 
const MAX_GEMINI_TEST_FIX_ATTEMPTS = 1;
const GEMINI_RETRY_DELAY_MS = 1000;
const MAX_INITIAL_GENERATION_ATTEMPTS = 2;


export interface GenerateBlockDefinitionResult {
  definition: BlockDefinition;
  success: boolean; // Indicates if the block was generated and added, even if tests failed.
  message: string;
  testFixAttempts?: number; // Number of logic code fix attempts.
  finalTestPassed?: boolean; // Indicates if self-tests ultimately passed.
}

export function parseJsonFromGeminiResponse(responseText: string): any {
  let jsonToParse = responseText.trim();
  const fenceContentRegex = /```(?:[a-zA-Z0-9_.-]+)?\s*\n?([\s\S]*?)\n?\s*```/;
  const fenceMatch = jsonToParse.match(fenceContentRegex);
  
  if (fenceMatch && fenceMatch[1] !== undefined) {
    jsonToParse = fenceMatch[1].trim(); 
    const langTagInContentRegex = /^(?:json|javascript)\s*\n/i;
    if (langTagInContentRegex.test(jsonToParse)) {
      jsonToParse = jsonToParse.substring(jsonToParse.indexOf('\n') + 1).trim();
    }
  }

  try {
    return JSON.parse(jsonToParse);
  } catch (e) {
    const error = e as SyntaxError;
    // Make the condition for attempting salvage more general
    if (error instanceof SyntaxError && 
        (error.message.includes('Unexpected token') ||
         error.message.includes('after JSON data') ||
         error.message.includes('after JSON at position'))) {
      console.warn("Attempting to salvage JSON due to trailing data. Original error:", error.message);
      let openBraceCount = 0;
      let inString = false;
      let escapeNext = false;
      let potentialEndIndex = -1;
      let firstStructuralCharProcessed = false;

      for (let i = 0; i < jsonToParse.length; i++) {
        const char = jsonToParse[i];
        if (escapeNext) { escapeNext = false; continue; }
        if (char === '\\') { escapeNext = true; continue; }
        if (char === '"') { inString = !inString; }
        if (!inString) {
          if (char === '{' || char === '[') {
            if (!firstStructuralCharProcessed) firstStructuralCharProcessed = true;
            openBraceCount++;
          } else if (char === '}' || char === ']') {
            if (!firstStructuralCharProcessed) { potentialEndIndex = -1; break; }
            openBraceCount--;
            if (openBraceCount === 0) {
              potentialEndIndex = i;
              const trimmedOriginal = jsonToParse.trim();
              const firstChar = trimmedOriginal.charAt(0);
              if ((firstChar === '{' && char === '}') || (firstChar === '[' && char === ']')) {
                 break; 
              } else if (firstChar !== '{' && firstChar !== '[') {
                  potentialEndIndex = -1; break;
              }
            } else if (openBraceCount < 0) {
                potentialEndIndex = -1; break;
            }
          }
        }
      }
      if (potentialEndIndex !== -1 && firstStructuralCharProcessed) {
        const potentialJson = jsonToParse.substring(0, potentialEndIndex + 1);
        try {
          const parsed = JSON.parse(potentialJson);
          console.warn(`Gemini response had trailing data. Successfully parsed by isolating the main JSON structure. Trailing: '${jsonToParse.substring(potentialEndIndex + 1, potentialEndIndex + 51).trim()}'`);
          return parsed;
        } catch (innerE) {
          console.error("Failed to parse even the isolated JSON substring:", innerE, "Substring preview:", potentialJson.substring(0, 200));
        }
      } else {
        console.warn("Could not determine a clear end for the JSON object for salvage, or JSON structure was invalid from start.");
      }
    }
    const errorMessage = `Failed to parse JSON response: ${ (e as Error).message }`;
    console.error(errorMessage, "Raw (processed for parsing) response text preview:", jsonToParse.substring(0, 500));
    throw new Error(errorMessage + ` Response (start): ${jsonToParse.substring(0,200)}`);
  }
}

async function executeGeneratedTests(
    logicCode: string,
    logicCodeTests: string,
    blockDefinitionContext: Pick<BlockDefinition, 'name' | 'inputs' | 'outputs' | 'parameters' | 'description'>
): Promise<{ passed: boolean; failures: Array<{ testName: string; error: string }> }> {
    
    let mainLogicFunction: Function;
    try {
        mainLogicFunction = new Function('inputs', 'params', 'internalState', 'setOutput', '__custom_block_logger__', 'audioContextInfo', 'postMessageToWorklet', logicCode);
    } catch (e: any) {
        return { passed: false, failures: [{ testName: "LogicCode Compilation Error", error: `Failed to compile logicCode: ${e.message}` }] };
    }

    let overallResult: { passed: boolean; failures: Array<{ testName: string; error: string }> } = { passed: true, failures: [] };
    
    let currentTestOutputs: Record<string, any> = {};
    let currentTestLogs: string[] = [];
    let currentSuiteName: string = "Unnamed Suite";

    const mockSetOutput = (outputId: string, value: any) => { currentTestOutputs[outputId] = value; };
    const mockLogger = (message: string) => { currentTestLogs.push(message); };
    
    const testScope = {
        describe: (name: string, suiteFn: () => void) => {
            console.log(`[Test Execution for ${blockDefinitionContext.name}] Entering suite: ${name}`);
            currentSuiteName = name;
            try { suiteFn(); }
            catch (e: any) {
                const failureMessage = `Error during describe block for "${name}": ${e.message}`;
                console.error(`[Test Execution Error] ${failureMessage}`);
                overallResult.passed = false;
                overallResult.failures.push({ testName: `Suite Setup: ${name}`, error: e.message });
            }
        },
        it: async (name: string, testFn: (context: { 
            TestedLogic: Function, 
            getOutputs: () => Record<string, any>, 
            getLogs: () => string[],
            resetTestContext: () => void
        }) => void | Promise<void>) => {
            const fullTestName = `${currentSuiteName} > ${name}`;
            console.log(`[Test Execution for ${blockDefinitionContext.name}] Running test: ${fullTestName}`);
            currentTestOutputs = {}; 
            currentTestLogs = [];    
            try {
                await testFn({
                    TestedLogic: (inputs: any, params: any, internalState: any = {}) => {
                        return mainLogicFunction(inputs, params, internalState, mockSetOutput, mockLogger, undefined, undefined);
                    },
                    getOutputs: () => currentTestOutputs,
                    getLogs: () => currentTestLogs,
                    resetTestContext: () => { currentTestOutputs = {}; currentTestLogs = []; }
                });
            } catch (e: any) { 
                const failureMessage = `Test "${fullTestName}" failed: ${e.message}`;
                console.error(`[Test Execution Error] ${failureMessage}`);
                overallResult.passed = false;
                overallResult.failures.push({ testName: fullTestName, error: e.message });
            }
        },
        // expect: testRegistry.expect,
    };

    try {
        // Wrap the execution of the test string itself in a Function constructor
        const testExecutor = new Function('describe', 'it', 'expect', logicCodeTests);
        await testExecutor(testScope.describe, testScope.it, testScope.expect);
    } catch (e: any) {
        const failureMessage = `Error executing test script (syntax or structure error): ${e.message}`;
        console.error(`[Test Execution Error] ${failureMessage}`);
        overallResult.passed = false;
        overallResult.failures.push({ testName: "Test Script Execution Error", error: e.message });
    }
    return overallResult;
}

async function fixLogicCodeFromTestFailures(
    originalUserPrompt: string,
    failingLogicCode: string,
    logicCodeTests: string,
    testFailures: Array<{ testName: string; error: string }>,
    blockDefinitionContext: Pick<BlockDefinition, 'name' | 'inputs' | 'outputs' | 'parameters' | 'description'>
): Promise<string> {
    if (!ai) throw new Error("Gemini API key not configured.");

    const failureDetails = testFailures.map(f => `Test: ${f.testName}\nError: ${f.error}`).join('\n\n');
    const contextString = `
Original user request: "${originalUserPrompt}"
Block Name: ${blockDefinitionContext.name}
Description: ${blockDefinitionContext.description || 'N/A'}
Inputs: ${JSON.stringify(blockDefinitionContext.inputs?.map(i => ({id: i.id, name: i.name, type: i.type, description: i.description, audioParamTarget: i.audioParamTarget })))}
Outputs: ${JSON.stringify(blockDefinitionContext.outputs?.map(o => ({id: o.id, name: o.name, type: o.type, description: o.description})))}
Parameters: ${JSON.stringify(blockDefinitionContext.parameters?.map(p => ({id: p.id, name: p.name, type: p.type, defaultValue: p.defaultValue, min: p.min, max: p.max, step: p.step, options: p.options, description: p.description})))}

Failing logicCode:
\`\`\`javascript
${failingLogicCode}
\`\`\`

logicCodeTests that were run:
\`\`\`javascript
${logicCodeTests}
\`\`\`

Failing test details:
${failureDetails}

Please analyze the failures and provide a corrected logicCode that passes the tests and adheres to the block's definition and original prompt.
`;

    let attempts = 0;
    while (attempts < MAX_GEMINI_CODE_FIX_ATTEMPTS) { // Use specific constant for code fix
        try {
            const response: GenerateContentResponse = await ai.models.generateContent({
                model: "gemini-2.5-flash-preview-04-17",
                contents: contextString,
                config: {
                    responseMimeType: "application/json",
                    systemInstruction: GEMINI_SYSTEM_PROMPT_FOR_TEST_FIXING_LOGIC_CODE,
                },
            });
            const parsedJson = parseJsonFromGeminiResponse(response.text);
            if (!parsedJson || typeof parsedJson.fixedLogicCode !== 'string') {
                throw new Error("Generated JSON for code fix is missing 'fixedLogicCode'.");
            }
            console.log("[DEBUG] Gemini generated fixedLogicCode:", parsedJson.fixedLogicCode);
            return parsedJson.fixedLogicCode.trim();
        } catch (error) {
            attempts++;
            console.error(`Gemini API call (fixLogicCode) attempt ${attempts} failed:`, error);
            if (attempts >= MAX_GEMINI_CODE_FIX_ATTEMPTS) {
                 throw new Error(`Gemini API error during code fix after ${attempts} attempts: ${(error as Error).message}`);
            }
            await new Promise(resolve => setTimeout(resolve, GEMINI_RETRY_DELAY_MS));
        }
    }
    throw new Error("Exited retry loop unexpectedly in fixLogicCodeFromTestFailures.");
}

export async function fixLogicCodeTestsFromFailures(
    originalUserPrompt: string,
    logicCode: string,
    failingLogicCodeTests: string,
    testFailuresOrReason: string, 
    blockDefinitionContext: Pick<BlockDefinition, 'name' | 'inputs' | 'outputs' | 'parameters' | 'description'>
): Promise<string> {
    if (!ai) throw new Error("Gemini API key not configured.");

    const contextString = `
Original user request for the block: "${originalUserPrompt}"
Block Name: ${blockDefinitionContext.name}
Description: ${blockDefinitionContext.description || 'N/A'}
Inputs: ${JSON.stringify(blockDefinitionContext.inputs?.map(i => ({id: i.id, name: i.name, type: i.type, description: i.description, audioParamTarget: i.audioParamTarget })))}
Outputs: ${JSON.stringify(blockDefinitionContext.outputs?.map(o => ({id: o.id, name: o.name, type: o.type, description: o.description})))}
Parameters: ${JSON.stringify(blockDefinitionContext.parameters?.map(p => ({id: p.id, name: p.name, type: p.type, defaultValue: p.defaultValue, min: p.min, max: p.max, step: p.step, options: p.options, description: p.description})))}

The logicCode the tests are for:
\`\`\`javascript
${logicCode}
\`\`\`

The current (failing or problematic) logicCodeTests:
\`\`\`javascript
${failingLogicCodeTests}
\`\`\`

Reason tests are suspected to be flawed or details of failures:
${testFailuresOrReason}

Please analyze the logicCode, the original prompt, and the test issues. Provide a corrected logicCodeTests string that accurately tests the logicCode.
`;

    let attempts = 0;
    while (attempts < MAX_GEMINI_TEST_FIX_ATTEMPTS) { // Use specific constant for test fix
        try {
            const response: GenerateContentResponse = await ai.models.generateContent({
                model: "gemini-2.5-flash-preview-04-17",
                contents: contextString,
                config: {
                    responseMimeType: "application/json",
                    systemInstruction: GEMINI_SYSTEM_PROMPT_FOR_TEST_FIXING_TEST_CODE,
                },
            });
            const parsedJson = parseJsonFromGeminiResponse(response.text);
            if (!parsedJson || typeof parsedJson.fixedLogicCodeTests !== 'string') {
                throw new Error("Generated JSON for test fix is missing 'fixedLogicCodeTests'.");
            }
            console.log("[DEBUG] Gemini generated fixedLogicCodeTests:", parsedJson.fixedLogicCodeTests);
            return parsedJson.fixedLogicCodeTests.trim();
        } catch (error) {
            attempts++;
            console.error(`Gemini API call (fixLogicCodeTests) attempt ${attempts} failed:`, error);
            if (attempts >= MAX_GEMINI_TEST_FIX_ATTEMPTS) {
                 throw new Error(`Gemini API error during test fix after ${attempts} attempts: ${(error as Error).message}`);
            }
            await new Promise(resolve => setTimeout(resolve, GEMINI_RETRY_DELAY_MS));
        }
    }
    throw new Error("Exited retry loop unexpectedly in fixLogicCodeTestsFromFailures.");
}


export async function generateBlockDefinitionWithTesting(
    userPrompt: string,
    addSystemMessage: (message: string, isError?: boolean) => void 
): Promise<GenerateBlockDefinitionResult> {
  if (!ai) {
    throw new Error("Gemini API key not configured. Cannot generate block definition.");
  }
  
  let initialDefinitionJson: any;
  let attempts = 0;

  addSystemMessage("Generating initial block definition from prompt...");
  while (attempts < MAX_INITIAL_GENERATION_ATTEMPTS) {
    try {
      const response: GenerateContentResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-04-17", 
        contents: userPrompt, 
        config: {
          responseMimeType: "application/json",
          systemInstruction: GEMINI_SYSTEM_PROMPT_FOR_BLOCK_DEFINITION,
        },
      });
      initialDefinitionJson = parseJsonFromGeminiResponse(response.text);
      console.log("[DEBUG] Gemini generated initial BlockDefinition JSON:", JSON.stringify(initialDefinitionJson, null, 2));
      break; 
    } catch (error) {
      attempts++;
      console.error(`Gemini API call (initial generate) attempt ${attempts} failed:`, error);
      if (attempts >= MAX_INITIAL_GENERATION_ATTEMPTS) {
        addSystemMessage(`Failed to generate initial block definition after ${attempts} attempts: ${(error as Error).message}`, true);
        throw error; 
      }
      await new Promise(resolve => setTimeout(resolve, GEMINI_RETRY_DELAY_MS));
    }
  }

  if (!initialDefinitionJson.id || !initialDefinitionJson.name || !initialDefinitionJson.logicCode || !initialDefinitionJson.initialPrompt) {
    const errorMsg = "Generated JSON for block definition is missing required fields (id, name, logicCode, initialPrompt).";
    addSystemMessage(errorMsg, true);
    throw new Error(errorMsg);
  }
  if (initialDefinitionJson.audioWorkletCode && !initialDefinitionJson.audioWorkletProcessorName) {
    const errorMsg = "Block definition has audioWorkletCode but is missing audioWorkletProcessorName.";
    addSystemMessage(errorMsg, true);
    throw new Error(errorMsg);
  }
  
  // Ensure isAiGenerated is set, default to true if missing from Gemini response
  initialDefinitionJson.isAiGenerated = initialDefinitionJson.isAiGenerated === undefined ? true : !!initialDefinitionJson.isAiGenerated;

  if (initialDefinitionJson.parameters && Array.isArray(initialDefinitionJson.parameters)) {
    initialDefinitionJson.parameters = initialDefinitionJson.parameters.map((p: any) => {
      let currentValue = p.defaultValue;
      let typedDefaultValue = p.defaultValue;
      if (p.type === 'slider' || p.type === 'knob' || p.type === 'number_input') {
          const parsedDefault = parseFloat(p.defaultValue as string); 
          const parsedMin = p.min !== undefined ? parseFloat(p.min as any) : undefined;
          typedDefaultValue = !isNaN(parsedDefault) ? parsedDefault : (parsedMin !== undefined && !isNaN(parsedMin) ? parsedMin : 0);
          currentValue = typedDefaultValue; 
      } else if (p.type === 'toggle') {
          typedDefaultValue = typeof p.defaultValue === 'boolean' ? p.defaultValue : (String(p.defaultValue).toLowerCase() === 'true');
          currentValue = typedDefaultValue;
      } else if (p.type === 'select' && p.options && p.options.length > 0 && !p.options.find((opt: {value:any}) => opt.value === p.defaultValue)) {
          typedDefaultValue = p.options[0].value;
          currentValue = typedDefaultValue;
      }
      // Ensure BlockParameterDefinition structure (no currentValue here, but ensure defaultValue is typed)
      const paramDef = { ...p, defaultValue: typedDefaultValue };
      delete paramDef.currentValue; // Explicitly remove if Gemini incorrectly adds it
      return paramDef;
    });
  } else {
    initialDefinitionJson.parameters = []; 
  }
  initialDefinitionJson.inputs = initialDefinitionJson.inputs || [];
  initialDefinitionJson.outputs = initialDefinitionJson.outputs || [];

  let currentDefinition = { ...initialDefinitionJson, initialPrompt: userPrompt } as BlockDefinition;
  
  if (currentDefinition.logicCodeTests && currentDefinition.logicCodeTests.trim() !== "") {
    addSystemMessage("Generated definition includes tests. Running tests...");
    let logicCodeFixCycles = 0;
    let testsPassed = false;
    
    let effectiveLogicCode = currentDefinition.logicCode;
    let effectiveLogicCodeTests = currentDefinition.logicCodeTests;
    const blockContextForTests = {
        name: currentDefinition.name,
        inputs: currentDefinition.inputs,
        outputs: currentDefinition.outputs,
        parameters: currentDefinition.parameters,
        description: currentDefinition.description
    };

    // --- Logic Code Fix Loop ---
    while (logicCodeFixCycles < MAX_GEMINI_CODE_FIX_ATTEMPTS && !testsPassed) {
      const testResults = await executeGeneratedTests(
          effectiveLogicCode,
          effectiveLogicCodeTests,
          blockContextForTests
      );
      
      if (testResults.passed) {
        testsPassed = true;
        addSystemMessage(`Tests passed for '${currentDefinition.name}' with current logic code (Fix Cycle ${logicCodeFixCycles}).`);
        break;
      } else {
        addSystemMessage(`Tests failed (Logic Code Fix Cycle ${logicCodeFixCycles + 1}/${MAX_GEMINI_CODE_FIX_ATTEMPTS}). Attempting to fix logic code...`, true);
        testResults.failures.forEach(f => addSystemMessage(` - ${f.testName}: ${f.error}`, true));
        
        try {
          const fixedLogicCode = await fixLogicCodeFromTestFailures(
            userPrompt, 
            effectiveLogicCode, 
            effectiveLogicCodeTests, 
            testResults.failures,
            blockContextForTests
          );
          effectiveLogicCode = fixedLogicCode; 
        } catch (fixError) {
          addSystemMessage(`Error asking AI to fix logic code: ${(fixError as Error).message}. Stopping logic code fix attempts.`, true);
          break; 
        }
      }
      logicCodeFixCycles++;
    }

    // --- Test Suite Fix Loop (if logic code fixes didn't pass tests) ---
    if (!testsPassed && effectiveLogicCodeTests && effectiveLogicCodeTests.trim() !== "") {
        let testSuiteFixCycles = 0;
        while(testSuiteFixCycles < MAX_GEMINI_TEST_FIX_ATTEMPTS && !testsPassed) {
            addSystemMessage(`Logic code fixes did not achieve passing tests. Attempting to fix test suite (Attempt ${testSuiteFixCycles + 1}/${MAX_GEMINI_TEST_FIX_ATTEMPTS})...`, true);
            
            const currentFailuresForTestFixer = await executeGeneratedTests(
                effectiveLogicCode,
                effectiveLogicCodeTests, 
                blockContextForTests
            );

            if (currentFailuresForTestFixer.passed) {
                addSystemMessage(`Tests unexpectedly passed before attempting test suite fix. Marking as passed.`, true);
                testsPassed = true;
                break;
            }
            currentFailuresForTestFixer.failures.forEach(f => addSystemMessage(` (For test fixer) - ${f.testName}: ${f.error}`, true));

            try {
                const fixedLogicCodeTests = await fixLogicCodeTestsFromFailures(
                    userPrompt,
                    effectiveLogicCode,       
                    effectiveLogicCodeTests,  
                    currentFailuresForTestFixer.failures.map(f => `Test: ${f.testName}\nError: ${f.error}`).join('\n\n'),
                    blockContextForTests
                );
                effectiveLogicCodeTests = fixedLogicCodeTests;

                const finalTestResults = await executeGeneratedTests(
                    effectiveLogicCode,
                    effectiveLogicCodeTests,
                    blockContextForTests
                );

                if (finalTestResults.passed) {
                    testsPassed = true;
                    addSystemMessage(`Tests passed for '${currentDefinition.name}' after AI fixed the test suite.`, true);
                } else {
                    addSystemMessage(`Tests still failed even after AI attempted to fix the test suite. Failures:`, true);
                    finalTestResults.failures.forEach(f => addSystemMessage(` - ${f.testName}: ${f.error}`, true));
                }
            } catch (testFixError) {
                addSystemMessage(`Error asking AI to fix tests: ${(testFixError as Error).message}.`, true);
                break; 
            }
            testSuiteFixCycles++;
        }
    }
    
    currentDefinition.logicCode = effectiveLogicCode;
    currentDefinition.logicCodeTests = effectiveLogicCodeTests;

    const messageEndReason = testsPassed 
        ? `self-tests passed${logicCodeFixCycles > 0 ? ` after ${logicCodeFixCycles} logic code fix cycle(s)` : ''}${currentDefinition.logicCodeTests !== initialDefinitionJson.logicCodeTests ? ' and test suite adjustments.' : '.'}`
        : `self-tests failed after ${logicCodeFixCycles} logic code fix cycle(s) and potential test suite fix attempts.`;
    
    // 'success: true' means block was generated and can be added, even if tests failed.
    // 'finalTestPassed' specifically indicates if tests passed.
    return { 
        definition: currentDefinition, 
        success: true, 
        message: `Block '${currentDefinition.name}' created; ${messageEndReason}`,
        testFixAttempts: logicCodeFixCycles, 
        finalTestPassed: testsPassed 
    };

  } else {
    addSystemMessage(`No tests provided for '${currentDefinition.name}', skipping test phase.`);
    return { definition: currentDefinition, success: true, message: `Block '${currentDefinition.name}' created. No self-tests were provided by AI.`, finalTestPassed: undefined };
  }
}


export async function modifyLogicCodeWithPrompt(
  currentLogicCode: string,
  userPromptForModification: string,
  blockContext?: { 
    inputs: BlockDefinition['inputs'], 
    outputs: BlockDefinition['outputs'], 
    parameters: BlockDefinition['parameters'], 
    name: string, 
    description?: string 
  }
): Promise<string> {
  if (!ai) {
    throw new Error("Gemini API key not configured. Cannot modify logic code.");
  }

  let contextString = "";
  if (blockContext) {
    contextString = `
Context for the code modification:
Block Name: ${blockContext.name}
Description: ${blockContext.description || 'N/A'}
Inputs: ${JSON.stringify(blockContext.inputs.map(i => ({id: i.id, name: i.name, type: i.type, description: i.description, audioParamTarget: i.audioParamTarget})))}
Outputs: ${JSON.stringify(blockContext.outputs.map(o => ({id: o.id, name: o.name, type: o.type, description: o.description})))}
Parameters: ${JSON.stringify(blockContext.parameters.map(p => ({id: p.id, name: p.name, type: p.type, defaultValue: p.defaultValue, min: p.min, max: p.max, step: p.step, options: p.options, description: p.description})))}
`;
  }

  const fullUserContent = `
${contextString}
Current JavaScript function body:
\`\`\`javascript
${currentLogicCode}
\`\`\`

User request for modification: "${userPromptForModification}"
`;
  let attempts = 0;
  while(attempts < MAX_GEMINI_CODE_FIX_ATTEMPTS) { // Using code fix attempts here as well
    try {
      const response: GenerateContentResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-04-17", 
        contents: fullUserContent,
        config: {
          responseMimeType: "application/json", 
          systemInstruction: GEMINI_SYSTEM_PROMPT_FOR_CODE_MODIFICATION,
        }
      });
      
      const parsedJson = parseJsonFromGeminiResponse(response.text);
      
      if (!parsedJson || typeof parsedJson.modifiedLogicCode !== 'string') {
        console.error("Generated JSON for code modification missing 'modifiedLogicCode' string field:", parsedJson, "Raw response text:", response.text);
        throw new Error("Generated JSON for code modification is missing or has an invalid 'modifiedLogicCode' field.");
      }
      
      console.log("[DEBUG] Gemini generated modifiedLogicCode:", parsedJson.modifiedLogicCode);

      let finalCode = parsedJson.modifiedLogicCode.trim();
      const codeFenceRegex = /```(?:[a-zA-Z0-9_.-]+)?\s*\n?([\s\S]*?)\n?\s*```/;
      const fenceMatch = finalCode.match(codeFenceRegex);
      if (fenceMatch && fenceMatch[1]) {
        finalCode = fenceMatch[1].trim();
        const langTagInContentRegex = /^(?:javascript|js)\s*\n/i;
        if (langTagInContentRegex.test(finalCode)) {
          finalCode = finalCode.substring(finalCode.indexOf('\n') + 1).trim();
        }
      }
      return finalCode;
    } catch (error) {
      attempts++;
      console.error(`Gemini API call (modifyLogicCode) attempt ${attempts} failed:`, error);
      if (attempts >= MAX_GEMINI_CODE_FIX_ATTEMPTS) {
        if (error instanceof Error && error.message.includes("Failed to parse JSON")) {
          throw error; 
        }
        throw new Error(`Gemini API error during code modification after ${MAX_GEMINI_CODE_FIX_ATTEMPTS} attempts: ${(error as Error).message}`);
      }
      await new Promise(resolve => setTimeout(resolve, GEMINI_RETRY_DELAY_MS));
    }
  }
  throw new Error("Exited retry loop unexpectedly in modifyLogicCodeWithPrompt.");
}