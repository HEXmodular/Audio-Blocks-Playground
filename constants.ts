
import { BlockDefinition, BlockParameterDefinition, BlockPort, BlockParameter, Scale as AppScale } from './types'; // Added BlockParameterDefinition, AppScale

// Helper to correctly type and initialize parameter definitions for BlockDefinition objects.
// Input pDefProto is effectively Omit<BlockParameter, 'currentValue' | 'defaultValue'> & { defaultValue: any }
// This function is used by individual block definition files, so it must remain exported.
// However, if createParameterDefinitions is only used by block definitions that are now self-contained
// and no longer in this file, this export might become unnecessary if those files import it from a shared util.
// For now, assuming it's still needed by some definition files that might not be part of the core set, or by AI generation.
// Let's assume it's still needed by other parts of the system or future AI-generated blocks not directly in /blocks.
// If it turns out to be truly unneeded later, it can be removed in a subsequent step.
// For this cleanup, we focus on removing the direct block definition objects and ALL_BLOCK_DEFINITIONS array.
export const createParameterDefinitions = (
  params: Array<Omit<BlockParameter, 'currentValue' | 'defaultValue'> & { defaultValue: any, steps?: number, isFrequency?: boolean }>
): BlockParameterDefinition[] => {
  return params.map(pDefProto => {
    let typedDefaultValue = pDefProto.defaultValue;

    if (pDefProto.type === 'slider' || pDefProto.type === 'knob' || pDefProto.type === 'number_input') {
      const parsedDefault = parseFloat(pDefProto.defaultValue as string);
      if (!isNaN(parsedDefault)) {
        typedDefaultValue = parsedDefault;
      } else {
        const parsedMin = pDefProto.min !== undefined ? parseFloat(pDefProto.min as any) : undefined;
        typedDefaultValue = (parsedMin !== undefined && !isNaN(parsedMin)) ? parsedMin : 0;
      }
    } else if (pDefProto.type === 'toggle') {
      typedDefaultValue = typeof pDefProto.defaultValue === 'boolean' ? pDefProto.defaultValue : String(pDefProto.defaultValue).toLowerCase() === 'true';
    } else if (pDefProto.type === 'select' && pDefProto.options && pDefProto.options.length > 0) {
      const defaultOptionExists = pDefProto.options.find(opt => opt.value === pDefProto.defaultValue);
      if (!defaultOptionExists) {
        typedDefaultValue = pDefProto.options[0].value;
      }
      // If defaultOptionExists or no options, typedDefaultValue remains pDefProto.defaultValue
    } else if (pDefProto.type === 'step_sequencer_ui') {
      if (Array.isArray(pDefProto.defaultValue) && pDefProto.defaultValue.every(val => typeof val === 'boolean')) {
        typedDefaultValue = pDefProto.defaultValue;
      } else {
        // Default to 'steps' if provided, otherwise default to 4 steps if defaultValue is not a valid boolean array.
        const numSteps = typeof pDefProto.steps === 'number' && pDefProto.steps > 0 ? pDefProto.steps : 4;
        typedDefaultValue = Array(numSteps).fill(false);
        console.warn(`Invalid or missing defaultValue for step_sequencer_ui '${pDefProto.id}'. Defaulting to ${numSteps} false steps.`);
      }
    }
    // For other types (text_input, etc.), typedDefaultValue remains as is.

    // Return BlockParameterDefinition (no currentValue)
    return {
      id: pDefProto.id,
      name: pDefProto.name,
      type: pDefProto.type,
      options: pDefProto.options,
      min: pDefProto.min,
      max: pDefProto.max,
      step: pDefProto.step,
      defaultValue: typedDefaultValue, // Typed defaultValue
      description: pDefProto.description,
      steps: pDefProto.steps, // Include steps if defined
      isFrequency: pDefProto.isFrequency // Include isFrequency hint
      // No 'currentValue' here
    };
  });
};

// const OSCILLATOR_WORKLET_PROCESSOR_NAME = 'oscillator-processor'; // Removed
// const OSCILLATOR_WORKLET_CODE = `...`; // Removed
// export const OSCILLATOR_BLOCK_DEFINITION: BlockDefinition = { ... }; // Removed

// const SAMPLE_BUFFER_PROCESSOR_NAME = 'sample-buffer-processor'; // Removed in previous diff already
// const SAMPLE_BUFFER_WORKLET_CODE = `...`; // Removed in previous diff already

// export const GAIN_BLOCK_DEFINITION: BlockDefinition = { ... }; // Removed

// export const AUDIO_OUTPUT_BLOCK_DEFINITION = IMPORTED_AUDIO_OUTPUT_DEFINITION; // Removed (re-export)
// The import for IMPORTED_AUDIO_OUTPUT_DEFINITION will be removed next.
// NATIVE_LOGIC_CODE_PLACEHOLDER, BPM_FRACTIONS, SEQUENCER_BPM_FRACTIONS, LYRIA_SCALE_OPTIONS
// and GEMINI_SYSTEM_PROMPT constants remain as they are general utilities or system prompts.

export const NATIVE_LOGIC_CODE_PLACEHOLDER = `
// This block is implemented natively by the browser (e.g., OscillatorNode, BiquadFilterNode, DelayNode, AnalyserNode, ConstantSourceNode).
// Its AudioParams and properties are controlled by the audio engine (useAudioEngine.ts) based on UI changes ('params') and connected inputs (passed to engine).
// This main-thread 'logicCode' does not process or output audio. 'inputs.audio_in' will be null.
// Audio connections ('audio_in', 'audio_out', CV inputs) are part of the Web Audio API graph, managed by the host.
// The 'audioContextInfo' object in scope may contain { sampleRate: number, bpm: number }.
// __custom_block_logger__('Native Block: Main-thread tick. Parameters for the native AudioNode are managed by the host audio engine.');
return {}; // No internal state change by default.
`.trim();


const BPM_FRACTIONS = [
  {value: 4, label: '1 Bar (4/4)'}, {value: 2, label: '1/2 Note'}, {value: 1, label: '1/4 Note (Beat)'},
  {value: 0.5, label: '1/8 Note'}, {value: 0.25, label: '1/16 Note'}, {value: 0.125, label: '1/32 Note'},
  {value: 1/3, label: '1/4 Triplet'}, {value: 1/6, label: '1/8 Triplet'}, {value: 1/12, label: '1/16 Triplet'},
  {value: 0.75, label: 'Dotted 1/8 Note'}, {value: 1.5, label: 'Dotted 1/4 Note'}
];
BPM_FRACTIONS.sort((a, b) => b.value - a.value); // Sort from longest to shortest duration for UI
// This is used by some block definitions (e.g. LFO BPM Sync, Sequencers) which are now in their own files.
// However, those files might not re-export it, and other parts of the system (like AI generation context) might need it.
// For now, keep it exported here if it's referenced by prompts or other non-block-definition parts of the system.
// If it's *only* used by the block definitions themselves, it could be moved/made local to them or a shared util.
// Given its general nature for musical timing, it's reasonable to keep it here.
export const BPM_FRACTIONS_EXPORT = BPM_FRACTIONS; // Exporting with a distinct name if needed, or keep as is.


// This is used by StepSequencer and ProbabilitySequencer, which are now in their own files.
// Similar to BPM_FRACTIONS, keeping it here if it's needed by other parts, otherwise could be moved.
export const SEQUENCER_BPM_FRACTIONS_EXPORT = BPM_FRACTIONS.filter(f => f.value <=4 && f.value >= 1/32);


// This is used by LyriaMasterBlockDefinition, which is now in its own file.
// Keeping it here for similar reasons - potential use by AI or other system parts.
export const LYRIA_SCALE_OPTIONS_EXPORT = Object.entries(AppScale).map(([label, value]) => ({
    label: label.replace(/_/g, ' ').replace('SHARP', '#').replace('FLAT', 'b'),
    value: value,
}));


export const GEMINI_SYSTEM_PROMPT_FOR_BLOCK_DEFINITION = `
You are an expert in Web Audio API and creative audio programming.
You will be given a user prompt to create an audio processing block.
Respond with a JSON object matching the BlockDefinition interface.
The BlockDefinition interface is:
export interface BlockDefinition {
  id: string; // Unique ID, e.g., "my-filter-v1", "custom-synth-v1"
  name: string; // User-friendly name, e.g., "My Custom Filter", "Advanced Synthesizer"
  description?: string; // Optional brief description of what the block does
  inputs: BlockPort[]; // Array of input ports
  outputs: BlockPort[]; // Array of output ports
  parameters: BlockParameterDefinition[]; // Array of parameters that can be controlled by the user
  logicCode: string; // JavaScript code for the block's main-thread logic. This code runs in a function scope.
                      // Available in scope: inputs (object with input values), params (object with parameter values),
                      // internalState (object, persists across runs, initially {}), setOutput(outputId, value) function,
                      // __custom_block_logger__(message) function, audioContextInfo ({sampleRate, bpm}), postMessageToWorklet(message) if worklet used.
                      // It should return the new internalState.
  initialPrompt: string; // The original user prompt that led to this definition.
  runsAtAudioRate?: boolean; // True if this block involves Web Audio API nodes or AudioWorklets directly processing/generating audio.
  audioWorkletProcessorName?: string; // If using an AudioWorklet, its registered name (e.g., "my-processor").
  audioWorkletCode?: string; // Full JavaScript code for the AudioWorkletProcessor class. Do NOT include registerProcessor call.
  logicCodeTests?: string; // Optional Jest-like test string for the logicCode.
                           // Available in test scope: describe, it, expect (with common matchers like toBe, toEqual, toContain, toThrow, etc.).
                           // 'it' callback receives a context object: { TestedLogic(inputs, params, internalState), getOutputs(), getLogs(), resetTestContext() }.
                           // TestedLogic executes the block's logicCode.
  isAiGenerated?: boolean; // Should be true for blocks generated by you.
}
export interface BlockPort { id: string; name: string; type: 'number'|'string'|'boolean'|'audio'|'trigger'|'any'|'gate'; description?: string; audioParamTarget?: string; }
export interface BlockParameterDefinition { id: string; name: string; type: 'slider'|'knob'|'toggle'|'select'|'number_input'|'text_input'|'step_sequencer_ui'; options?: Array<{value: string|number; label: string}>; min?: number; max?: number; step?: number; defaultValue: any; description?: string; steps?: number; isFrequency?: boolean; }

Guidelines for BlockDefinition:
- ID: Lowercase, hyphenated, versioned (e.g., "user-delay-v1").
- Name: Title Case, user-friendly.
- Ports:
  - Type 'audio': For Web Audio signal paths. If an input port of type 'audio' is intended to directly modulate an AudioParam of a native node or an AudioWorkletNode, its 'id' should conventionally be like 'paramName_cv_in' (e.g., 'freq_cv_in') and its 'audioParamTarget' field should be set to the exact AudioParam name (e.g., 'frequency').
  - Type 'trigger': For momentary events (e.g., note on, reset). Value is true for one tick, then null.
  - Type 'gate': For sustained signals (e.g., note hold). Value is true while active, false otherwise.
  - Type 'any': For flexible data types, like complex objects or arrays.
- Parameters:
  - 'defaultValue' must be correctly typed (number for slider/knob/number_input, boolean for toggle, string/number for select, string for text_input, boolean[] for step_sequencer_ui).
  - For step_sequencer_ui: 'steps' defines the number of steps. 'defaultValue' is a boolean array of this length.
  - For number_input with 'isFrequency: true', it implies the input field can accept direct Hz values or note names like "A4", "C#3".
- logicCode:
  - Must be a string containing the body of a JavaScript function.
  - Use \`inputs.port_id\` to access input values.
  - Use \`params.param_id\` to access parameter values.
  - Use \`setOutput('output_id', value)\` to set output values.
  - Use \`__custom_block_logger__('message')\` for logging within the block.
  - Return an object for \`internalState\` to persist data. Modify \`internalState.myValue = ...\` and return \`internalState\`.
  - For blocks wrapping NATIVE Web Audio nodes (OscillatorNode, GainNode, BiquadFilterNode, DelayNode, AnalyserNode, ConstantSourceNode), the \`logicCode\` should be set to \`NATIVE_LOGIC_CODE_PLACEHOLDER\` (see constants). The audio engine will handle these. Do NOT write custom logic for these specific native types unless the prompt explicitly asks for a *custom worklet-based* version.
  - If \`runsAtAudioRate\` is true and it's NOT a NATIVE_LOGIC_CODE_PLACEHOLDER block, you usually need an AudioWorklet. Provide \`audioWorkletProcessorName\` and \`audioWorkletCode\`.
  - \`audioWorkletCode\` should define a class extending \`AudioWorkletProcessor\`. The host will handle \`registerProcessor\`.
  - Communication from \`logicCode\` to its \`AudioWorkletProcessor\` is via \`postMessageToWorklet({ type: 'MY_MESSAGE', value: ... })\`. The worklet uses \`this.port.onmessage\` and \`this.port.postMessage\`.
- logicCodeTests:
  - Provide simple tests for the main logic paths of the \`logicCode\`.
  - Focus on input/output behavior and internal state changes.
  - Example: \`it('should output sum of inputs', (context) => { const state = context.TestedLogic({in1: 2, in2: 3}, {}, {}); expect(context.getOutputs().sum_out).toBe(5); });\`
  - If the block is NATIVE_LOGIC_CODE_PLACEHOLDER or primarily a worklet, tests for \`logicCode\` might be minimal or omitted if not much main-thread logic.
- runsAtAudioRate: True if it generates/processes audio with Web Audio API (native nodes or worklets). False for pure logic/data blocks.
- isAiGenerated: Always true.
- Ensure all string literals within JSON are properly escaped.
- Do not include comments in the final JSON output.

Respond ONLY with the single JSON BlockDefinition object. Do not add any explanatory text outside the JSON.
`.trim();

export const GEMINI_SYSTEM_PROMPT_FOR_CODE_MODIFICATION = `
You are an expert in JavaScript and Web Audio API.
You will be given the current JavaScript \`logicCode\` of an audio block, its definition context (inputs, outputs, parameters), and a user request for modification.
The \`logicCode\` runs in a function scope with \`inputs\`, \`params\`, \`internalState\`, \`setOutput\`, \`__custom_block_logger__\`, \`audioContextInfo\`, \`postMessageToWorklet\` available.
It must return the new \`internalState\`.

Your task is to provide the MODIFIED \`logicCode\` based on the user's request.
Respond with a JSON object: \`{ "modifiedLogicCode": "...", "reasoning": "..." }\`.
"reasoning" should be a brief explanation of the changes made.
Ensure \`modifiedLogicCode\` is a string containing only the function body.
Do not include comments in the \`modifiedLogicCode\` string itself unless specifically part of the logic.
Only provide the JSON object.
`.trim();

export const GEMINI_SYSTEM_PROMPT_FOR_TEST_FIXING_LOGIC_CODE = `
You are an expert in JavaScript debugging and testing.
You will receive: the original user prompt for a block, the block's definition (inputs, outputs, parameters), the failing 'logicCode', the 'logicCodeTests' that were run, and the details of the test failures.
Your task is to analyze the failures and provide a corrected 'logicCode'.
The 'logicCode' runs in a function scope with 'inputs', 'params', 'internalState', 'setOutput', '__custom_block_logger__', 'audioContextInfo', 'postMessageToWorklet' available. It must return the new 'internalState'.
Respond with a JSON object: \`{ "fixedLogicCode": "...", "analysis": "Brief analysis of why tests failed and how code was fixed." }\`.
Ensure 'fixedLogicCode' is a string containing only the function body. Only provide the JSON object.
`.trim();

export const GEMINI_SYSTEM_PROMPT_FOR_TEST_FIXING_TEST_CODE = `
You are an expert in JavaScript testing and Web Audio block logic.
You will receive: the original user prompt for a block, the block's definition (inputs, outputs, parameters), the 'logicCode' for the block, the current 'logicCodeTests' that are problematic, and the reason the tests are suspected to be flawed (e.g., test failures that seem to indicate issues with the tests themselves, or a request to improve test coverage).
Your task is to analyze the 'logicCode' and the existing tests, then provide a corrected or improved 'logicCodeTests' string.
The tests use a Jest-like syntax: describe, it, expect. The 'it' callback receives a context: { TestedLogic(inputs, params, internalState), getOutputs(), getLogs(), resetTestContext() }.
Respond with a JSON object: \`{ "fixedLogicCodeTests": "...", "analysis": "Brief analysis of the issues with the original tests and how they were improved." }\`.
Ensure 'fixedLogicCodeTests' is a string containing the test code. Only provide the JSON object.
`.trim();


// ALL_BLOCK_DEFINITIONS array is removed as BlockStateManager now aggregates definitions directly.
// Individual block definition constants (like OSCILLATOR_BLOCK_DEFINITION, etc.) are also removed.
// Consumers (BlockStateManager, useAudioEngine) now import definitions directly from their source files in src/blocks/.