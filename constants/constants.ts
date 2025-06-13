import { BlockDefinition, BlockParameterDefinition, BlockParameter } from '@interfaces/common';

// Helper to correctly type and initialize parameter definitions for BlockDefinition objects.
export const createParameterDefinitions = (
  params: Array<Omit<BlockParameter, 'currentValue' | 'defaultValue'> & { defaultValue: any, steps?: number, isFrequency?: boolean }>
): BlockParameterDefinition[] => {
  return params.map(pDefProto => {
    let typedDefaultValue = pDefProto.defaultValue;
    if (pDefProto.type === 'slider' || pDefProto.type === 'knob' || pDefProto.type === 'number_input') {
      const parsedDefault = parseFloat(pDefProto.defaultValue as string);
      typedDefaultValue = !isNaN(parsedDefault) ? parsedDefault : (pDefProto.min !== undefined ? parseFloat(pDefProto.min as any) : 0);
    } else if (pDefProto.type === 'toggle') {
      typedDefaultValue = typeof pDefProto.defaultValue === 'boolean' ? pDefProto.defaultValue : String(pDefProto.defaultValue).toLowerCase() === 'true';
    } else if (pDefProto.type === 'select' && pDefProto.options && pDefProto.options.length > 0) {
      const defaultOptionExists = pDefProto.options.find(opt => opt.value === pDefProto.defaultValue);
      typedDefaultValue = defaultOptionExists ? pDefProto.defaultValue : pDefProto.options[0].value;
    } else if (pDefProto.type === 'step_sequencer_ui') {
      const numSteps = typeof pDefProto.steps === 'number' && pDefProto.steps > 0 ? pDefProto.steps : 4;
      typedDefaultValue = (Array.isArray(pDefProto.defaultValue) && pDefProto.defaultValue.length === numSteps && pDefProto.defaultValue.every(val => typeof val === 'boolean'))
        ? pDefProto.defaultValue
        : Array(numSteps).fill(false);
    }
    return {
      id: pDefProto.id, name: pDefProto.name, type: pDefProto.type, options: pDefProto.options,
      min: pDefProto.min, max: pDefProto.max, step: pDefProto.step, defaultValue: typedDefaultValue,
      description: pDefProto.description, steps: pDefProto.steps, isFrequency: pDefProto.isFrequency,
    };
  });
};

// Moved from AudioEngineService.ts to break circular dependency
const SAMPLE_BUFFER_PROCESSOR_NAME = 'sample-buffer-processor';
const SAMPLE_BUFFER_WORKLET_CODE = `
    class SampleBufferProcessor extends AudioWorkletProcessor {
      static get parameterDescriptors() {
        return [];
      }

      constructor(options) {
        super(options);
        this.instanceId = options?.processorOptions?.instanceId || 'UnknownSampleBufferWorklet';
        this.recentSamples = new Float32Array(1024); // Store last 1024 samples
        this.recentSamplesWritePtr = 0;

        this.port.onmessage = (event) => {
          if (event.data?.type === 'GET_RECENT_SAMPLES') {
            const orderedSamples = new Float32Array(this.recentSamples.length);
            let readPtr = this.recentSamplesWritePtr;
            for (let i = 0; i < this.recentSamples.length; i++) {
              orderedSamples[i] = this.recentSamples[readPtr];
              readPtr = (readPtr + 1) % this.recentSamples.length;
            }
            this.port.postMessage({ type: 'RECENT_SAMPLES_DATA', samples: orderedSamples });
          }
        };
      }

      process(inputs, outputs, parameters) {
        const input = inputs[0];
        const output = outputs[0];

        if (input && input.length > 0 && output && output.length > 0) {
          const inputChannel = input[0];
          const outputChannel = output[0];
          if (inputChannel && outputChannel) {
            for (let i = 0; i < outputChannel.length; ++i) {
              const sample = inputChannel[i] !== undefined ? inputChannel[i] : 0;
              outputChannel[i] = sample;
              this.recentSamples[this.recentSamplesWritePtr] = sample;
              this.recentSamplesWritePtr = (this.recentSamplesWritePtr + 1) % this.recentSamples.length;
            }
          }
        } else if (output && output.length > 0) {
          const outputChannel = output[0];
          if (outputChannel) {
            for (let i = 0; i < outputChannel.length; ++i) {
              outputChannel[i] = 0;
              this.recentSamples[this.recentSamplesWritePtr] = 0;
              this.recentSamplesWritePtr = (this.recentSamplesWritePtr + 1) % this.recentSamples.length;
            }
          }
        }
        return true;
      }
    }
    // IMPORTANT: The registerProcessor call will be done by the host environment (useAudioEngine)
    `;

export const AUDIO_OUTPUT_BLOCK_DEFINITION: BlockDefinition = {
    id: 'system-audio-output-v1',
    name: 'Audio Output',
    description: 'Plays the incoming audio signal. Contains an internal GainNode for volume control which then feeds a SampleBufferProcessor AudioWorklet (acting as a sink). The input port connects to this internal GainNode.',
    runsAtAudioRate: true,
    inputs: [
        { id: 'audio_in', name: 'Audio Input', type: 'audio', description: 'Signal to play. Connects to the internal volume GainNode.' }
    ],
    outputs: [],
    parameters: createParameterDefinitions([
        { id: 'volume', name: 'Volume', type: 'slider', min: 0, max: 1, step: 0.01, defaultValue: 0.7, description: 'Output volume level (controls an internal GainNode AudioParam)' }
    ]),
    logicCode: "", // No specific main-thread logic code, it's a sink with an AudioWorklet.
    audioWorkletProcessorName: SAMPLE_BUFFER_PROCESSOR_NAME,
    audioWorkletCode: SAMPLE_BUFFER_WORKLET_CODE,
    isAiGenerated: false, // This is a system block
    initialPrompt: '', // Not applicable
};


const OSCILLATOR_WORKLET_PROCESSOR_NAME = 'oscillator-processor';
const OSCILLATOR_WORKLET_CODE = `
class OscillatorProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'frequency', defaultValue: 440, minValue: 0.01, maxValue: 22050, automationRate: 'a-rate' },
      { name: 'gain', defaultValue: 0.5, minValue: 0, maxValue: 200, automationRate: 'a-rate' }, // Max gain increased
    ];
  }

  constructor(options) {
    super(options);
    this.phase = 0;
    this.waveform = (options?.processorOptions?.waveform) || 'sine';
    this.instanceId = options?.processorOptions?.instanceId || 'UnknownOscillatorWorklet';
    // sampleRate is global in AudioWorkletGlobalScope

    this.port.onmessage = (event) => {
      if (event.data?.type === 'SET_WAVEFORM') {
        this.waveform = event.data.waveform;
      }
      if (event.data?.type === 'TRIGGER_PHASE_RESET') {
        this.phase = 0;
      }
    };
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const outputChannel = output[0];

    const frequencyParams = parameters.frequency;
    const gainParams = parameters.gain;

    for (let i = 0; i < outputChannel.length; ++i) {
      const frequency = frequencyParams.length > 1 ? frequencyParams[i] : frequencyParams[0];
      const gain = gainParams.length > 1 ? gainParams[i] : gainParams[0];

      const increment = frequency / sampleRate; // sampleRate is from AudioWorkletGlobalScope
      this.phase = (this.phase + increment) % 1.0;

      let sampleValue = 0;
      switch (this.waveform) {
        case 'sine':
          sampleValue = Math.sin(this.phase * 2 * Math.PI);
          break;
        case 'square':
          sampleValue = this.phase < 0.5 ? 1 : -1;
          break;
        case 'sawtooth':
          sampleValue = (this.phase * 2) - 1;
          break;
        case 'triangle':
          sampleValue = 2 * (0.5 - Math.abs(this.phase - 0.5)) * 2 - 1;
          break;
        default:
          sampleValue = Math.sin(this.phase * 2 * Math.PI);
      }
      outputChannel[i] = sampleValue * gain;
    }
    return true;
  }
}
// IMPORTANT: The registerProcessor call will be done by the host environment (useAudioEngine)
// after extracting this code string. Do not include registerProcessor here.
`;

export const OSCILLATOR_BLOCK_DEFINITION: BlockDefinition = {
  id: 'oscillator-v1',
  name: 'Oscillator (Worklet)',
  description: 'Generates a waveform (sine, square, saw, triangle) using an AudioWorklet. Supports phase reset via trigger.',
  runsAtAudioRate: true,
  inputs: [
    { id: 'freq_in', name: 'Frequency CV', type: 'audio', description: 'Modulates frequency AudioParam directly in Web Audio graph.', audioParamTarget: 'frequency' },
    { id: 'trigger_in', name: 'Trigger', type: 'trigger', description: 'Restarts phase on trigger (handled by logicCode via postMessageToWorklet)' }
  ],
  outputs: [
    { id: 'audio_out', name: 'Audio Output', type: 'audio', description: 'The generated audio signal (from AudioWorklet)' }
  ],
  parameters: createParameterDefinitions([ // Use new helper
    { id: 'frequency', name: 'Frequency', type: 'slider', min: 20, max: 5000, step: 1, defaultValue: 220, description: 'Base frequency in Hz for the AudioParam', isFrequency: true },
    { id: 'waveform', name: 'Waveform', type: 'select', options: [{value: 'sine', label: 'Sine'}, {value: 'square', label: 'Square'}, {value: 'sawtooth', label: 'Sawtooth'}, {value: 'triangle', label: 'Triangle'}], defaultValue: 'sine', description: 'Shape of the waveform, controlled via port message to worklet' },
    { id: 'gain', name: 'Gain/CV Depth', type: 'slider', min: 0, max: 200, step: 0.1, defaultValue: 0.5, description: 'Output amplitude or CV modulation depth. Controls the gain AudioParam in the worklet.' }
  ]),
  logicCode: `
// Main-thread logic for Oscillator. Audio is generated and output by its associated AudioWorklet.
// AudioParams (frequency, gain) are set by the host (App.tsx) based on 'params' values.
// 'freq_in' (type 'audio') is connected directly to the 'frequency' AudioParam by the host if a connection exists. This logicCode does not process 'freq_in'.
// This logicCode handles 'trigger_in' and 'waveform' parameter changes by sending messages to the worklet.

const triggerInputVal = inputs.trigger_in; // This is a non-audio trigger signal
const currentWaveform = params.waveform;

if (internalState.lastWaveform !== currentWaveform) {
  if (postMessageToWorklet) {
    postMessageToWorklet({ type: 'SET_WAVEFORM', waveform: currentWaveform });
    __custom_block_logger__(\`Waveform changed to: \${currentWaveform}\`);
  }
  internalState.lastWaveform = currentWaveform;
}

// For trigger inputs, it's common to detect a rising edge (false to true)
if (triggerInputVal === true && (internalState.prevTriggerState === false || internalState.prevTriggerState === undefined || internalState.prevTriggerState === null)) {
  if (postMessageToWorklet) {
    postMessageToWorklet({ type: 'TRIGGER_PHASE_RESET' });
     __custom_block_logger__('Phase reset triggered for worklet.');
  }
}
internalState.prevTriggerState = triggerInputVal; // Store the current state for next comparison

return internalState;
  `.trim(),
  initialPrompt: 'Create a basic audio oscillator block with frequency, waveform (sine, square, sawtooth, triangle), and gain parameters. It should accept frequency control voltage input (as an audio-rate signal for direct AudioParam modulation) and a trigger input to reset phase. It should output an audio signal. This version will use an AudioWorklet for sound generation.',
  audioWorkletProcessorName: OSCILLATOR_WORKLET_PROCESSOR_NAME,
  audioWorkletCode: OSCILLATOR_WORKLET_CODE,
};

// NATIVE_LOGIC_CODE_PLACEHOLDER has been removed as it's no longer used by the refactored native block definitions.

export const BPM_FRACTIONS = [
  {value: 4, label: '1 Bar (4/4)'}, {value: 2, label: '1/2 Note'}, {value: 1, label: '1/4 Note (Beat)'},
  {value: 0.5, label: '1/8 Note'}, {value: 0.25, label: '1/16 Note'}, {value: 0.125, label: '1/32 Note'},
  {value: 1/3, label: '1/4 Triplet'}, {value: 1/6, label: '1/8 Triplet'}, {value: 1/12, label: '1/16 Triplet'},
  {value: 0.75, label: 'Dotted 1/8 Note'}, {value: 1.5, label: 'Dotted 1/4 Note'}
];
BPM_FRACTIONS.sort((a, b) => b.value - a.value); // Sort from longest to shortest duration for UI

export const MANUAL_GATE_BLOCK_DEFINITION: BlockDefinition = {
  id: 'manual-gate-v1',
  name: 'Manual Gate',
  description: 'Provides a manual gate signal via a toggle UI parameter.',
  inputs: [],
  outputs: [
    { id: 'gate_out', name: 'Gate Output', type: 'gate', description: 'Boolean gate signal.' }
  ],
  parameters: createParameterDefinitions([
    { id: 'gate_active', name: 'Gate Active', type: 'toggle', defaultValue: false, description: 'Controls the state of the gate output.' }
  ]),
  logicCode: `
// Outputs the state of the 'gate_active' parameter.
const gateState = params.gate_active;
setOutput('gate_out', gateState);
// __custom_block_logger__(\`Manual Gate output: \${gateState}\`);
return {};
  `.trim(),
  initialPrompt: 'Create a Manual Gate block. It should have one toggle parameter "Gate Active" and one output port "Gate Output" of type gate. The output should reflect the state of the toggle.',
};

export const NUMBER_TO_CONSTANT_AUDIO_BLOCK_DEFINITION: BlockDefinition = {
  id: 'number-to-constant-audio-v1',
  name: 'Number to Constant Audio',
  description: 'Converts a number input to a constant audio signal via ConstantSourceNode, with gain control.',
  runsAtAudioRate: true,
  inputs: [
    { id: 'number_in', name: 'Number In', type: 'number', description: 'Numeric value to output as constant audio.' }
  ],
  outputs: [
    { id: 'audio_out', name: 'Audio Output', type: 'audio', description: 'Constant audio signal.' }
  ],
  parameters: createParameterDefinitions([
    { id: 'gain', name: 'Gain', type: 'slider', min: 0, max: 1, step: 0.01, defaultValue: 1, description: 'Gain applied to the constant audio signal.' },
    { id: 'max_input_value', name: 'Max Expected Input', type: 'number_input', min: 1, defaultValue: 255, description: 'Expected maximum of number_in, for normalization to -1 to 1 range before gain.'}
  ]),
  logicCode: "",
};

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


export const ALL_BLOCK_DEFINITIONS: BlockDefinition[] = [
  AUDIO_OUTPUT_BLOCK_DEFINITION, // Added this
  OSCILLATOR_BLOCK_DEFINITION,
  MANUAL_GATE_BLOCK_DEFINITION,
];
