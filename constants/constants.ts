
import { BlockDefinition, BlockParameterDefinition, BlockParameter, Scale as AppScale } from '@interfaces/common'; // Added BlockParameterDefinition, AppScale. Removed unused BlockPort.

// Helper to correctly type and initialize parameter definitions for BlockDefinition objects.
// Input pDefProto is effectively Omit<BlockParameter, 'currentValue' | 'defaultValue'> & { defaultValue: any }
// because the objects passed to it will have these fields.
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

const BPM_FRACTIONS = [
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

const SEQUENCER_BPM_FRACTIONS = BPM_FRACTIONS.filter(f => f.value <=4 && f.value >= 1/32); // Sensible range for sequencers

export const STEP_SEQUENCER_BLOCK_DEFINITION: BlockDefinition = {
  id: 'step-sequencer-v1',
  name: 'Step Sequencer',
  description: 'A step sequencer with trigger input, and trigger/gate outputs. Can run on internal BPM clock or external trigger.',
  inputs: [
    { id: 'ext_trigger_in', name: 'External Trigger', type: 'trigger', description: 'Advances the sequencer one step if Run Mode is External.' }
  ],
  outputs: [
    { id: 'trigger_out', name: 'Trigger Output', type: 'trigger', description: 'Outputs a trigger when an active step is played.' },
    { id: 'gate_out', name: 'Gate Output', type: 'gate', description: 'Outputs a gate signal (high for active step duration, low otherwise).' }
  ],
  parameters: createParameterDefinitions([
    { id: 'steps_pattern', name: 'Steps Pattern', type: 'step_sequencer_ui', defaultValue: [true, false, true, false, true, false, true, false], steps: 8, description: 'Pattern of active steps.' },
    { id: 'run_mode', name: 'Run Mode', type: 'select', options: [{value: 'internal_bpm', label: 'Internal BPM'}, {value: 'external_trigger', label: 'External Trigger'}], defaultValue: 'internal_bpm', description: 'Clock source for the sequencer.' },
    { id: 'bpm_fraction_rate', name: 'Rate (BPM Fraction)', type: 'select', options: SEQUENCER_BPM_FRACTIONS, defaultValue: 0.25, description: 'Sequencer step rate when in Internal BPM mode.' },
    { id: 'num_steps', name: 'Number of Steps', type: 'slider', min: 1, max: 16, step: 1, defaultValue: 8, description: 'Total number of steps in the sequence.' }
  ]),
  logicCode: `
// Step Sequencer Logic
const runMode = params.run_mode;
const externalTrigger = inputs.ext_trigger_in;
const stepsPattern = params.steps_pattern; // boolean[]
const numSteps = Math.max(1, Math.min(16, params.num_steps || stepsPattern.length)); // Clamp num_steps

let currentStep = internalState.currentStepIndex || 0;
let timeSinceLastInternalStep = internalState.timeSinceLastInternalStep || 0;
let gateHigh = false;
let triggerOut = null;

const bpm = audioContextInfo ? audioContextInfo.bpm : 120;
const sampleRate = audioContextInfo ? audioContextInfo.sampleRate : 44100;
const samplesPerBlock = 128; // Assuming typical AudioWorklet block size for timing

const bpmFraction = parseFloat(params.bpm_fraction_rate);
const beatsPerStep = bpmFraction; // e.g., 0.25 for 1/16th notes means each step is 0.25 beats
const secondsPerBeat = 60.0 / bpm;
const secondsPerStep = secondsPerBeat * beatsPerStep;
const samplesPerStep = Math.round(secondsPerStep * sampleRate);

function advanceStep() {
  currentStep = (currentStep + 1) % numSteps;
  internalState.currentStepIndex = currentStep;
  if (stepsPattern[currentStep]) {
    triggerOut = true; // Output trigger on active step
    gateHigh = true;
    __custom_block_logger__(\`Step \${currentStep + 1} triggered. Output: \${stepsPattern[currentStep]}\`);
  } else {
    gateHigh = false;
    // __custom_block_logger__(\`Step \${currentStep + 1} not active.\`);
  }
}

if (runMode === 'internal_bpm') {
  timeSinceLastInternalStep += samplesPerBlock;
  if (timeSinceLastInternalStep >= samplesPerStep) {
    advanceStep();
    timeSinceLastInternalStep = 0; // Reset counter
  }
} else if (runMode === 'external_trigger') {
  if (externalTrigger === true && (internalState.prevExtTriggerState === false || internalState.prevExtTriggerState === undefined || internalState.prevExtTriggerState === null)) {
    advanceStep();
  }
}

internalState.timeSinceLastInternalStep = timeSinceLastInternalStep;
internalState.prevExtTriggerState = externalTrigger;

setOutput('trigger_out', triggerOut);
setOutput('gate_out', gateHigh);

return internalState;
  `.trim(),
  initialPrompt: 'Create a Step Sequencer block. Parameters: "Steps Pattern" (step_sequencer_ui, default 8 steps), "Run Mode" (select: Internal BPM, External Trigger), "Rate (BPM Fraction)" (select: musical divisions for BPM sync), "Number of Steps" (slider 1-16). Inputs: "External Trigger". Outputs: "Trigger Output", "Gate Output". Logic should handle step advancement based on mode and timing.',
};

export const PROBABILITY_SEQUENCER_BLOCK_DEFINITION: BlockDefinition = {
  id: 'probability-sequencer-v1',
  name: 'Probability Sequencer',
  description: 'Step sequencer where each step has a probability of triggering.',
  inputs: [
    { id: 'ext_trigger_in', name: 'External Trigger', type: 'trigger', description: 'Advances the sequencer one step if Run Mode is External.' }
  ],
  outputs: [
    { id: 'trigger_out', name: 'Trigger Output', type: 'trigger', description: 'Outputs a trigger when an active step successfully plays based on its probability.' },
    { id: 'gate_out', name: 'Gate Output', type: 'gate', description: 'Outputs a gate signal if a step successfully plays.' }
  ],
  parameters: createParameterDefinitions([
    { id: 'steps_pattern', name: 'Steps Pattern (Activation)', type: 'step_sequencer_ui', defaultValue: [true, true, true, true, true, true, true, true], steps: 8, description: 'Determines if a step CAN play. Probability applies if active.' },
    { id: 'probabilities', name: 'Probabilities (0-100%)', type: 'text_input', defaultValue: '100,100,100,100,75,75,50,50', description: 'Comma-separated probabilities for each step (0-100). Length should match number of steps.'},
    { id: 'run_mode', name: 'Run Mode', type: 'select', options: [{value: 'internal_bpm', label: 'Internal BPM'}, {value: 'external_trigger', label: 'External Trigger'}], defaultValue: 'internal_bpm', description: 'Clock source for the sequencer.' },
    { id: 'bpm_fraction_rate', name: 'Rate (BPM Fraction)', type: 'select', options: SEQUENCER_BPM_FRACTIONS, defaultValue: 0.25, description: 'Sequencer step rate when in Internal BPM mode.' },
    { id: 'num_steps', name: 'Number of Steps', type: 'slider', min: 1, max: 16, step: 1, defaultValue: 8, description: 'Total number of steps in the sequence. Ensure Probabilities string matches this.' }
  ]),
  logicCode: `
// Probability Sequencer Logic
const runMode = params.run_mode;
const externalTrigger = inputs.ext_trigger_in;
const stepsPattern = params.steps_pattern; // boolean[] for activation
const numSteps = Math.max(1, Math.min(16, params.num_steps || stepsPattern.length));

const probabilitiesStr = params.probabilities || "";
const probabilityValues = probabilitiesStr.split(',').map(p => parseFloat(p.trim()) / 100.0); // Convert to 0.0-1.0

let currentStep = internalState.currentStepIndex || 0;
let timeSinceLastInternalStep = internalState.timeSinceLastInternalStep || 0;
let gateHigh = false;
let triggerOut = null;

const bpm = audioContextInfo ? audioContextInfo.bpm : 120;
const sampleRate = audioContextInfo ? audioContextInfo.sampleRate : 44100;
const samplesPerBlock = 128; 

const bpmFraction = parseFloat(params.bpm_fraction_rate);
const beatsPerStep = bpmFraction;
const secondsPerBeat = 60.0 / bpm;
const secondsPerStep = secondsPerBeat * beatsPerStep;
const samplesPerStep = Math.round(secondsPerStep * sampleRate);

function advanceStepAndCheckProbability() {
  currentStep = (currentStep + 1) % numSteps;
  internalState.currentStepIndex = currentStep;
  
  const stepIsActive = stepsPattern[currentStep] === true;
  const stepProbability = (probabilityValues[currentStep] !== undefined && !isNaN(probabilityValues[currentStep])) ? probabilityValues[currentStep] : 1.0;

  if (stepIsActive && Math.random() < stepProbability) {
    triggerOut = true;
    gateHigh = true;
    __custom_block_logger__(\`Step \${currentStep + 1} triggered (Prob: \${(stepProbability*100).toFixed(0)}%).\`);
  } else {
    gateHigh = false;
    // __custom_block_logger__(\`Step \${currentStep + 1} did not trigger (Active: \${stepIsActive}, Prob: \${(stepProbability*100).toFixed(0)}%).\`);
  }
}

if (runMode === 'internal_bpm') {
  timeSinceLastInternalStep += samplesPerBlock;
  if (timeSinceLastInternalStep >= samplesPerStep) {
    advanceStepAndCheckProbability();
    timeSinceLastInternalStep = 0;
  }
} else if (runMode === 'external_trigger') {
  if (externalTrigger === true && (internalState.prevExtTriggerState === false || internalState.prevExtTriggerState === undefined || internalState.prevExtTriggerState === null)) {
    advanceStepAndCheckProbability();
  }
}

internalState.timeSinceLastInternalStep = timeSinceLastInternalStep;
internalState.prevExtTriggerState = externalTrigger;

setOutput('trigger_out', triggerOut);
setOutput('gate_out', gateHigh);

return internalState;
  `.trim(),
  initialPrompt: 'Create a Probability Sequencer block. Parameters: "Steps Pattern (Activation)" (step_sequencer_ui), "Probabilities (0-100%)" (text_input, comma-separated), "Run Mode", "Rate (BPM Fraction)", "Number of Steps". Inputs: "External Trigger". Outputs: "Trigger Output", "Gate Output". Logic should consider step activation and its probability.',
};

export const RULE_110_BLOCK_DEFINITION: BlockDefinition = {
  id: 'rule-110-automaton-v1',
  name: 'Rule 110 Automaton',
  description: '1D cellular automaton (Rule 110). Outputs next state as a number. Can run on internal clock or external trigger. Includes LFO mode.',
  inputs: [
    { id: 'trigger_in', name: 'Trigger', type: 'trigger', description: 'Advances automaton one step.' },
    { id: 'numeric_state_in', name: 'Numeric State In', type: 'number', description: 'Overrides internal state with this number if connected.'}
  ],
  outputs: [
    { id: 'numeric_state_out', name: 'Numeric State Out', type: 'number', description: 'The numeric representation of the core cells of the next state.' }
  ],
  parameters: createParameterDefinitions([
    { id: 'core_length', name: 'Core Length (N)', type: 'slider', min: 1, max: 16, step: 1, defaultValue: 8, description: 'Number of core cells (excluding boundaries).' },
    { id: 'initial_pattern_plus_boundaries', name: 'Pattern + Boundaries', type: 'step_sequencer_ui', defaultValue: Array(18).fill(false), steps: 18, description: 'Initial state for L-Boundary, N Core cells, R-Boundary, and unused cells. Max 16 core + 2 boundaries = 18 total.' },
    { id: 'run_mode', name: 'Run Mode', type: 'select', options: [{value: 'internal_trigger', label: 'Internal Trigger'}, {value: 'external_trigger', label: 'External Trigger'}, {value: 'lfo', label: 'LFO Mode'}], defaultValue: 'internal_trigger', description: 'Clock source for automaton updates.' },
    { id: 'internal_freq_hz', name: 'Internal Freq (Hz)', type: 'number_input', min: 0.01, max: 8000, defaultValue: 10, description: 'Frequency for Internal Trigger or LFO mode (Hz).', isFrequency: true },
    { id: 'lfo_bpm_sync_rate', name: 'LFO BPM Sync Rate', type: 'select', options: BPM_FRACTIONS, defaultValue: 0.25, description: 'Rate for LFO mode if BPM synced (overrides Hz if selected).'},
    { id: 'lfo_sync_to_bpm', name: 'LFO Sync to BPM', type: 'toggle', defaultValue: false, description: 'Enable BPM sync for LFO mode.'}
  ]),
  logicCode: `
const coreLength = Math.max(1, Math.min(16, params.core_length));
const totalPatternLength = coreLength + 2; // L-Boundary + Core + R-Boundary
let currentPattern = internalState.currentPattern || [...(params.initial_pattern_plus_boundaries || [])].slice(0, totalPatternLength);
if (currentPattern.length !== totalPatternLength) { // Adjust if coreLength changed
  const defaultPattern = [...(params.initial_pattern_plus_boundaries || [])];
  currentPattern = Array(totalPatternLength).fill(false).map((_,i) => defaultPattern[i] === true);
}

const numericStateIn = inputs.numeric_state_in;
if (numericStateIn !== null && numericStateIn !== undefined && typeof numericStateIn === 'number' && isFinite(numericStateIn)) {
  const maxVal = (1 << coreLength) -1;
  const intVal = Math.max(0, Math.min(maxVal, Math.floor(numericStateIn)));
  for (let i = 0; i < coreLength; i++) {
    currentPattern[i + 1] = (intVal & (1 << (coreLength - 1 - i))) !== 0;
  }
  // __custom_block_logger__(\`External state applied: \${intVal}, Pattern: \${currentPattern.slice(1, coreLength+1).map(b=>b?1:0).join('')}\`);
}

const RULE_110_MAP = [0,1,1,1,0,1,1,0]; // For neighborhoods: 111 to 000 -> output bit

function applyRule110(left, middle, right) {
  const index = (left ? 4 : 0) + (middle ? 2 : 0) + (right ? 1 : 0);
  return RULE_110_MAP[index] === 1;
}

function stepAutomaton() {
  const nextPattern = [...currentPattern];
  for (let i = 0; i < coreLength; ++i) { // Iterate core cells
    const leftNeighbor = currentPattern[i];     // Cell at index i is left neighbor of core cell i+1
    const currentCell  = currentPattern[i + 1]; // Core cell
    const rightNeighbor= currentPattern[i + 2]; // Cell at index i+2 is right neighbor of core cell i+1
    nextPattern[i + 1] = applyRule110(leftNeighbor, currentCell, rightNeighbor);
  }
  currentPattern = nextPattern;
  internalState.currentPattern = currentPattern;

  let numericOutput = 0;
  for (let i = 0; i < coreLength; ++i) {
    if (currentPattern[i + 1]) { // Core cells are from index 1 to coreLength
      numericOutput |= (1 << (coreLength - 1 - i));
    }
  }
  setOutput('numeric_state_out', numericOutput);
  // __custom_block_logger__(\`Stepped. Core: \${currentPattern.slice(1, coreLength+1).map(b=>b?1:0).join('')}, Out: \${numericOutput}\`);
}

// Timing logic
const runMode = params.run_mode;
const externalTrigger = inputs.trigger_in;
const internalFreqHz = params.internal_freq_hz;
const lfoBpmSync = params.lfo_sync_to_bpm;
const lfoBpmFraction = parseFloat(params.lfo_bpm_sync_rate);

const bpm = audioContextInfo ? audioContextInfo.bpm : 120;
const sampleRate = audioContextInfo ? audioContextInfo.sampleRate : 44100;
const samplesPerBlock = 128;

let effectiveFreqHz;
if (runMode === 'lfo' && lfoBpmSync) {
  const beatsPerStep = lfoBpmFraction;
  const secondsPerBeat = 60.0 / bpm;
  const secondsPerStep = secondsPerBeat * beatsPerStep;
  effectiveFreqHz = 1.0 / secondsPerStep;
} else {
  effectiveFreqHz = internalFreqHz;
}

const samplesPerStepInternal = Math.max(1, Math.round(sampleRate / effectiveFreqHz));
let timeSinceLastInternalStep = internalState.timeSinceLastInternalStep || 0;

if (runMode === 'internal_trigger' || runMode === 'lfo') {
  timeSinceLastInternalStep += samplesPerBlock;
  if (timeSinceLastInternalStep >= samplesPerStepInternal) {
    stepAutomaton();
    timeSinceLastInternalStep = 0;
  }
} else if (runMode === 'external_trigger') {
  if (externalTrigger === true && (internalState.prevExtTriggerState === false || internalState.prevExtTriggerState === undefined)) {
    stepAutomaton();
  }
}
internalState.timeSinceLastInternalStep = timeSinceLastInternalStep;
internalState.prevExtTriggerState = externalTrigger;

return internalState;
  `.trim(),
  initialPrompt: 'Create a Rule 110 cellular automaton block. Parameters: "Core Length" (slider 1-16), "Pattern + Boundaries" (step_sequencer_ui, 18 steps for L-Bnd, N core, R-Bnd), "Run Mode" (select: Internal Trigger, External Trigger, LFO), "Internal Freq (Hz)" (number_input 0.01-8000), "LFO BPM Sync Rate" (select), "LFO Sync to BPM" (toggle). Inputs: "Trigger", "Numeric State In". Output: "Numeric State Out". Logic must implement Rule 110, handle timing for different modes, and convert core pattern to/from number. Max 16 core cells + 2 boundaries = 18 UI steps.',
};

const RULE_110_OSCILLATOR_WORKLET_PROCESSOR_NAME = 'rule-110-oscillator-processor';
const RULE_110_OSCILLATOR_WORKLET_CODE = `
// Rule 110 Oscillator Worklet Processor
class Rule110OscillatorProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'gain', defaultValue: 1, minValue: 0, maxValue: 10, automationRate: 'a-rate' },
      // Frequency is controlled by sample rate (CV into logic) and internal rule 110 speed.
      // The worklet itself doesn't have a frequency AudioParam directly tied to pitch.
    ];
  }

  constructor(options) {
    super(options);
    this.coreLength = options?.processorOptions?.coreLength || 8;
    this.outputMode = options?.processorOptions?.outputMode || 'sum_bits'; // 'sum_bits' or 'center_bit'
    
    // Initialize pattern: L-Boundary + Core + R-Boundary
    this.totalPatternLength = this.coreLength + 2;
    this.pattern = new Array(this.totalPatternLength).fill(false);
    const initialPatternParam = options?.processorOptions?.initialPattern || [];
    for(let i=0; i < Math.min(this.totalPatternLength, initialPatternParam.length); ++i) {
      this.pattern[i] = initialPatternParam[i] === true;
    }

    this.samplesSinceLastStep = 0;
    this.samplesPerRuleStep = options?.processorOptions?.samplesPerRuleStep || Math.round(sampleRate / 100); // Default 100 Hz update for Rule 110
    
    this.RULE_110_MAP = [0,1,1,1,0,1,1,0]; // For 111 to 000

    this.port.onmessage = (event) => {
      if (event.data?.type === 'SET_SAMPLES_PER_RULE_STEP') {
        this.samplesPerRuleStep = Math.max(1, Math.round(event.data.value));
      }
      if (event.data?.type === 'SET_PATTERN') {
         const newPatternArray = event.data.pattern; // Should be boolean array
         if (Array.isArray(newPatternArray) && newPatternArray.length === this.totalPatternLength) {
           this.pattern = [...newPatternArray];
         }
      }
      if (event.data?.type === 'SET_CORE_LENGTH') {
        this.coreLength = event.data.coreLength;
        this.totalPatternLength = this.coreLength + 2;
        // Re-initialize pattern based on new coreLength, possibly from a new full pattern if sent
        const currentFullPattern = event.data.fullPatternAfterResize || []; // Assume host sends adjusted pattern
        this.pattern = new Array(this.totalPatternLength).fill(false);
        for(let i=0; i < Math.min(this.totalPatternLength, currentFullPattern.length); ++i) {
          this.pattern[i] = currentFullPattern[i] === true;
        }
      }
       if (event.data?.type === 'SET_OUTPUT_MODE') {
        this.outputMode = event.data.outputMode;
      }
    };
  }

  applyRule110(left, middle, right) {
    const index = (left ? 4 : 0) + (middle ? 2 : 0) + (right ? 1 : 0);
    return this.RULE_110_MAP[index] === 1;
  }

  stepAutomaton() {
    const nextPattern = [...this.pattern];
    for (let i = 0; i < this.coreLength; ++i) {
      const leftNeighbor = this.pattern[i];
      const currentCell  = this.pattern[i + 1];
      const rightNeighbor= this.pattern[i + 2];
      nextPattern[i + 1] = this.applyRule110(leftNeighbor, currentCell, rightNeighbor);
    }
    this.pattern = nextPattern;
  }

  getOutputSample() {
    if (this.outputMode === 'center_bit') {
      const centerIndex = Math.floor(this.coreLength / 2) + 1; // +1 for L-Boundary offset
      return this.pattern[centerIndex] ? 1.0 : -1.0;
    } else { // 'sum_bits' (default)
      let sum = 0;
      for (let i = 0; i < this.coreLength; ++i) {
        if (this.pattern[i + 1]) { // Core cells are from index 1 to coreLength
          sum++;
        }
      }
      // Normalize sum to -1 to 1 range. Max sum is coreLength.
      if (this.coreLength === 0) return 0;
      return (sum / this.coreLength) * 2.0 - 1.0;
    }
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const outputChannel = output[0];
    const gainValues = parameters.gain;

    for (let i = 0; i < outputChannel.length; ++i) {
      if (this.samplesSinceLastStep >= this.samplesPerRuleStep) {
        this.stepAutomaton();
        this.samplesSinceLastStep = 0;
      }
      const gain = gainValues.length > 1 ? gainValues[i] : gainValues[0];
      outputChannel[i] = this.getOutputSample() * gain;
      this.samplesSinceLastStep++;
    }
    return true;
  }
}
`;
export const RULE_110_OSCILLATOR_BLOCK_DEFINITION: BlockDefinition = {
  id: 'rule-110-oscillator-v1',
  name: 'Rule 110 Oscillator',
  description: 'Oscillator using Rule 110 automaton for sound generation via AudioWorklet. CV input controls Rule 110 update rate.',
  runsAtAudioRate: true,
  inputs: [
    { id: 'rate_cv_in', name: 'Rate CV', type: 'audio', description: 'Controls update rate of the Rule 110 automaton (higher CV = faster updates).' }
  ],
  outputs: [
    { id: 'audio_out', name: 'Audio Output', type: 'audio', description: 'Generated audio signal from the automaton.' }
  ],
  parameters: createParameterDefinitions([
    { id: 'core_length', name: 'Core Length (N)', type: 'slider', min: 1, max: 16, step: 1, defaultValue: 8, description: 'Number of core cells for the automaton.' },
    { id: 'initial_pattern_plus_boundaries', name: 'Pattern + Boundaries', type: 'step_sequencer_ui', defaultValue: Array(18).fill(false), steps: 18, description: 'Initial state including boundaries.' },
    { id: 'base_update_rate_hz', name: 'Base Update Rate (Hz)', type: 'slider', min: 1, max: 20000, step: 1, defaultValue: 440, description: 'Base internal update frequency of the Rule 110 automaton.', isFrequency: true },
    { id: 'cv_sensitivity', name: 'CV Sensitivity', type: 'slider', min: 0, max: 5000, step: 1, defaultValue: 1000, description: 'Multiplier for rate_cv_in to modulate update rate.' },
    { id: 'output_mode', name: 'Output Mode', type: 'select', options: [{value: 'sum_bits', label: 'Sum Bits'}, {value: 'center_bit', label: 'Center Bit'}], defaultValue: 'sum_bits', description: 'Method to generate audio sample from pattern.' },
    { id: 'gain', name: 'Gain', type: 'slider', min: 0, max: 1, step: 0.01, defaultValue: 0.5, description: 'Output amplitude (controls AudioParam in worklet).' }
  ]),
  logicCode: `
// Main thread logic for Rule 110 Oscillator
const baseRateHz = params.base_update_rate_hz;
const cvSensitivity = params.cv_sensitivity;
const rateCV = inputs.rate_cv_in; // Expected to be audio-rate, effectively 0 if not connected.

// Rate CV is audio, typically -1 to 1. We want it to modulate positively around baseRate.
// Map CV from [-1, 1] to a multiplier, e.g., [0.1, 10] or similar.
// Let's say CV of 0 means base rate. CV of 1 means baseRate + cvSensitivity. CV of -1 means baseRate - cvSensitivity (clamped).
// A simpler approach for audio CV: treat it as a direct addition to frequency, scaled by sensitivity.
// If rateCV is an audio signal, it will average to 0 over time if not DC biased.
// For this example, let's assume host ensures rateCV is a somewhat stable value if connected to LFO, etc.
// Average of audio signal is 0, so let's use it as deviation.
// Effective rate = baseRate + (rateCV * cvSensitivity)
// This is tricky if rateCV is full audio. For now, let's assume it provides a control value.
// If rateCV input is not connected, inputs.rate_cv_in will be 0.
const modulatedRateHz = Math.max(1, baseRateHz + (rateCV * cvSensitivity)); // Ensure positive rate

const sampleRate = audioContextInfo ? audioContextInfo.sampleRate : 44100;
const samplesPerRuleStep = Math.max(1, Math.round(sampleRate / modulatedRateHz));

if (postMessageToWorklet) {
  if (internalState.lastSamplesPerRuleStep !== samplesPerRuleStep) {
    postMessageToWorklet({ type: 'SET_SAMPLES_PER_RULE_STEP', value: samplesPerRuleStep });
    internalState.lastSamplesPerRuleStep = samplesPerRuleStep;
    // __custom_block_logger__(\`Rule110Osc: Samples per step set to \${samplesPerRuleStep} (Rate: \${modulatedRateHz.toFixed(2)} Hz)\`);
  }
  
  const currentPattern = params.initial_pattern_plus_boundaries;
  if (JSON.stringify(internalState.lastPatternSent) !== JSON.stringify(currentPattern)) {
    postMessageToWorklet({ type: 'SET_PATTERN', pattern: currentPattern });
    internalState.lastPatternSent = [...currentPattern];
  }
  
  const coreLength = params.core_length;
  if (internalState.lastCoreLength !== coreLength) {
    postMessageToWorklet({ type: 'SET_CORE_LENGTH', coreLength: coreLength, fullPatternAfterResize: currentPattern });
    internalState.lastCoreLength = coreLength;
     __custom_block_logger__(\`Rule110Osc: Core length changed to \${coreLength}. Pattern may need UI refresh.\`);
  }

  const outputMode = params.output_mode;
  if (internalState.lastOutputMode !== outputMode) {
    postMessageToWorklet({ type: 'SET_OUTPUT_MODE', outputMode: outputMode });
    internalState.lastOutputMode = outputMode;
  }
}
// Gain is handled by AudioParam in worklet, host updates it from params.gain

return internalState;
  `.trim(),
  initialPrompt: 'Create a Rule 110 Oscillator. It uses a Rule 110 automaton in an AudioWorklet. Parameters: "Core Length", "Pattern + Boundaries", "Base Update Rate (Hz)", "CV Sensitivity", "Output Mode" (Sum Bits/Center Bit), "Gain". Inputs: "Rate CV" (audio). Output: "Audio Output". Logic code sends params to worklet. Worklet runs automaton, generates audio based on selected mode and pattern state, modulated by CV.',
  audioWorkletProcessorName: RULE_110_OSCILLATOR_WORKLET_PROCESSOR_NAME,
  audioWorkletCode: RULE_110_OSCILLATOR_WORKLET_CODE,
};

export const RULE_110_JOIN_BLOCK_DEFINITION: BlockDefinition = {
  id: 'rule-110-join-v1',
  name: 'Rule 110 Join',
  description: 'Joins two numeric states for a Rule 110 automaton, computes next step, splits, and outputs.',
  inputs: [
    { id: 'numeric_state_in_1', name: 'Numeric State In 1', type: 'number', description: 'First part of the automaton state.' },
    { id: 'numeric_state_in_2', name: 'Numeric State In 2', type: 'number', description: 'Second part of the automaton state.' },
    { id: 'trigger_in', name: 'Trigger', type: 'trigger', description: 'Advances automaton one step.' }
  ],
  outputs: [
    { id: 'numeric_state_out_1', name: 'Numeric State Out 1', type: 'number', description: 'First part of the next state.' },
    { id: 'numeric_state_out_2', name: 'Numeric State Out 2', type: 'number', description: 'Second part of the next state.' }
  ],
  parameters: createParameterDefinitions([
    { id: 'core_length_1', name: 'Core Length 1 (N1)', type: 'slider', min: 1, max: 8, step: 1, defaultValue: 4, description: 'Number of bits for state 1.' },
    { id: 'core_length_2', name: 'Core Length 2 (N2)', type: 'slider', min: 1, max: 8, step: 1, defaultValue: 4, description: 'Number of bits for state 2.' },
    { id: 'boundary_bits_handling', name: 'Boundary Bits', type: 'select', options: [{value:'zero', label:'Zeros'}, {value:'one', label:'Ones'}, {value:'wrap', label:'Wrap Around'}], defaultValue: 'zero', description: 'How to handle boundary bits for the combined automaton.'}
  ]),
  logicCode: `
const N1 = Math.max(1, Math.min(8, params.core_length_1));
const N2 = Math.max(1, Math.min(8, params.core_length_2));
const totalCoreLength = N1 + N2;

const stateIn1 = inputs.numeric_state_in_1;
const stateIn2 = inputs.numeric_state_in_2;
const trigger = inputs.trigger_in;

const RULE_110_MAP = [0,1,1,1,0,1,1,0];

function applyRule110(left, middle, right) {
  const index = (left ? 4 : 0) + (middle ? 2 : 0) + (right ? 1 : 0);
  return RULE_110_MAP[index] === 1;
}

// Initialize pattern if not present or if lengths changed
if (!internalState.currentPattern || internalState.N1 !== N1 || internalState.N2 !== N2) {
  internalState.currentPattern = new Array(totalCoreLength + 2).fill(false); // +2 for L/R boundaries
  internalState.N1 = N1;
  internalState.N2 = N2;
   __custom_block_logger__(\`Pattern re-initialized for N1=\${N1}, N2=\${N2}\`);
}
let currentPattern = internalState.currentPattern;

// Apply inputs to pattern if available
if (stateIn1 !== null && typeof stateIn1 === 'number') {
  const maxVal1 = (1 << N1) - 1;
  const intVal1 = Math.max(0, Math.min(maxVal1, Math.floor(stateIn1)));
  for (let i = 0; i < N1; i++) {
    currentPattern[i + 1] = (intVal1 & (1 << (N1 - 1 - i))) !== 0; // Bit 0 of stateIn1 is MSB of N1 part
  }
}
if (stateIn2 !== null && typeof stateIn2 === 'number') {
  const maxVal2 = (1 << N2) - 1;
  const intVal2 = Math.max(0, Math.min(maxVal2, Math.floor(stateIn2)));
  for (let i = 0; i < N2; i++) {
    currentPattern[N1 + i + 1] = (intVal2 & (1 << (N2 - 1 - i))) !== 0; // Bit 0 of stateIn2 is MSB of N2 part
  }
}

if (trigger === true && (internalState.prevTriggerState === false || internalState.prevTriggerState === undefined)) {
  const boundaryMode = params.boundary_bits_handling;
  // Set boundary bits before stepping
  if (boundaryMode === 'zero') {
    currentPattern[0] = false; // Left boundary
    currentPattern[totalCoreLength + 1] = false; // Right boundary
  } else if (boundaryMode === 'one') {
    currentPattern[0] = true;
    currentPattern[totalCoreLength + 1] = true;
  } else { // wrap
    currentPattern[0] = currentPattern[totalCoreLength]; // L-bnd = last core cell of combined
    currentPattern[totalCoreLength + 1] = currentPattern[1]; // R-bnd = first core cell of combined
  }
  
  const nextPattern = [...currentPattern];
  for (let i = 0; i < totalCoreLength; ++i) { // Iterate all core cells (N1+N2)
    const leftNeighbor = currentPattern[i];
    const currentCell  = currentPattern[i + 1];
    const rightNeighbor= currentPattern[i + 2];
    nextPattern[i + 1] = applyRule110(leftNeighbor, currentCell, rightNeighbor);
  }
  currentPattern = nextPattern;
  internalState.currentPattern = currentPattern;

  let numericOutput1 = 0;
  for (let i = 0; i < N1; ++i) {
    if (currentPattern[i + 1]) {
      numericOutput1 |= (1 << (N1 - 1 - i));
    }
  }
  setOutput('numeric_state_out_1', numericOutput1);

  let numericOutput2 = 0;
  for (let i = 0; i < N2; ++i) {
    if (currentPattern[N1 + i + 1]) {
      numericOutput2 |= (1 << (N2 - 1 - i));
    }
  }
  setOutput('numeric_state_out_2', numericOutput2);
  // __custom_block_logger__(\`Join: Stepped. Out1: \${numericOutput1}, Out2: \${numericOutput2}\`);
}
internalState.prevTriggerState = trigger;

return internalState;
  `.trim(),
  initialPrompt: 'Create a Rule 110 Join block. Parameters: "Core Length 1 (N1)" (slider 1-8), "Core Length 2 (N2)" (slider 1-8), "Boundary Bits" (select: Zeros, Ones, Wrap). Inputs: "Numeric State In 1", "Numeric State In 2", "Trigger". Outputs: "Numeric State Out 1", "Numeric State Out 2". Logic combines N1 and N2 bits, applies Rule 110 with chosen boundaries, then splits the result.',
};
 
export const RULE_110_BYTE_READER_BLOCK_DEFINITION: BlockDefinition = {
  id: 'rule-110-byte-reader-v1',
  name: 'Rule 110 Byte Reader',
  description: 'Reads a specific bit from incoming Rule 110 numeric states over N triggers, then outputs the collected byte (as number) and the chosen bit\'s last state.',
  inputs: [
    { id: 'numeric_state_in', name: 'Numeric State In', type: 'number', description: 'Input from a Rule 110 source.'},
    { id: 'trigger_in', name: 'Trigger', type: 'trigger', description: 'Reads one bit on trigger.'}
  ],
  outputs: [
    { id: 'byte_out', name: 'Byte Out', type: 'number', description: 'Collected byte (8 bits) as a number, MSB first. Outputs when N bits are collected.'},
    { id: 'selected_bit_out', name: 'Selected Bit Out', type: 'boolean', description: 'State of the chosen bit from the last read numeric state.'}
  ],
  parameters: createParameterDefinitions([
    { id: 'rule110_core_length', name: 'Input Core Length', type: 'slider', min:1, max:16, step:1, defaultValue:8, description: 'Core length of the Rule 110 source this block reads from.'},
    { id: 'bit_to_read', name: 'Bit to Read (0-indexed from MSB)', type: 'slider', min:0, max:15, step:1, defaultValue:0, description: 'Which bit of the input state to sample (0 is MSB).'},
    { id: 'bits_to_collect_N', name: 'Bits to Collect (N)', type: 'slider', min:1, max:8, step:1, defaultValue:8, description: 'Number of bits to collect before outputting byte_out.'}
  ]),
  logicCode: `
const coreLength = params.rule110_core_length;
const bitToRead = Math.min(params.bit_to_read, coreLength - 1); // Ensure bit_to_read is within coreLength
const N = params.bits_to_collect_N;

const numericStateIn = inputs.numeric_state_in;
const trigger = inputs.trigger_in;

let collectedBits = internalState.collectedBits || 0;
let bitCount = internalState.bitCount || 0;
let lastSelectedBitState = internalState.lastSelectedBitState || false;

if (trigger === true && (internalState.prevTriggerState === false || internalState.prevTriggerState === undefined)) {
  if (numericStateIn !== null && typeof numericStateIn === 'number' && isFinite(numericStateIn)) {
    // Extract the specified bit (0-indexed from MSB)
    // (numericStateIn >> (coreLength - 1 - bitToRead)) & 1
    const selectedBit = ( (Math.floor(numericStateIn) >> (coreLength - 1 - bitToRead)) & 1 ) === 1;
    lastSelectedBitState = selectedBit;
    
    collectedBits = (collectedBits << 1) | (selectedBit ? 1 : 0);
    bitCount++;
    
    // __custom_block_logger__(\`Read bit \${bitToRead} as \${selectedBit}. Collected: \${collectedBits.toString(2).padStart(bitCount,'0')}, Count: \${bitCount}/\${N}\`);

    if (bitCount >= N) {
      setOutput('byte_out', collectedBits & ((1 << N) -1) ); // Output last N bits
      // __custom_block_logger__(\`Byte output: \${collectedBits & ((1 << N) -1)} after \${N} bits.\`);
      collectedBits = 0; // Reset for next byte
      bitCount = 0;
    } else {
      setOutput('byte_out', null); // No full byte yet
    }
  }
}
setOutput('selected_bit_out', lastSelectedBitState);

internalState.collectedBits = collectedBits;
internalState.bitCount = bitCount;
internalState.lastSelectedBitState = lastSelectedBitState;
internalState.prevTriggerState = trigger;

return internalState;
  `.trim(),
  initialPrompt: 'Create a Rule 110 Byte Reader. Parameters: "Input Core Length" (slider 1-16), "Bit to Read (0-indexed from MSB)" (slider 0-15), "Bits to Collect (N)" (slider 1-8 for byte). Inputs: "Numeric State In", "Trigger". Outputs: "Byte Out" (number, after N bits), "Selected Bit Out" (boolean). Logic samples the chosen bit from input on trigger, accumulates N bits, then outputs byte.',
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

export const BYTE_REVERSE_BLOCK_DEFINITION: BlockDefinition = {
  id: 'byte-reverse-v1',
  name: 'Byte Reverse',
  description: 'Reverses the order of N bits in an incoming number.',
  inputs: [
    { id: 'number_in', name: 'Number In', type: 'number', description: 'Integer number to process.'}
  ],
  outputs: [
    { id: 'reversed_number_out', name: 'Reversed Number Out', type: 'number', description: 'Number with N LSBs reversed.'}
  ],
  parameters: createParameterDefinitions([
    { id: 'num_bits_N', name: 'Number of Bits (N)', type: 'slider', min:1, max:16, step:1, defaultValue:8, description: 'Number of LSBs to consider for reversal.'}
  ]),
  logicCode: `
const numberIn = inputs.number_in;
const N = params.num_bits_N;
let reversedNum = 0;

if (numberIn !== null && typeof numberIn === 'number' && isFinite(numberIn)) {
  const val = Math.floor(Math.abs(numberIn)); // Use positive integer part
  for (let i = 0; i < N; i++) {
    if ((val >> i) & 1) { // Check i-th LSB of input
      reversedNum |= (1 << (N - 1 - i)); // Set (N-1-i)-th LSB of output
    }
  }
  // __custom_block_logger__(\`Reversed \${val} (N=\${N}) to \${reversedNum}\`);
  setOutput('reversed_number_out', reversedNum);
} else {
  setOutput('reversed_number_out', 0); // Default if no valid input
}
return {};
  `.trim(),
  initialPrompt: 'Create a Byte Reverse block. Parameter: "Number of Bits (N)" (slider 1-16, default 8). Input: "Number In". Output: "Reversed Number Out". Logic reverses the order of the N least significant bits of the input number.',
};

const LYRIA_SCALE_OPTIONS = Object.entries(AppScale).map(([label, value]) => ({
    label: label.replace(/_/g, ' ').replace('SHARP', '#').replace('FLAT', 'b'), // Make it more readable
    value: value,
}));


export const LYRIA_MASTER_BLOCK_DEFINITION: BlockDefinition = {
  id: 'lyria-realtime-master-v1',
  name: 'Lyria Realtime Master',
  description: 'Generates music in real-time using Lyria. Audio output is handled by the integrated LiveMusicService.',
  runsAtAudioRate: true, // The service internally produces audio
  inputs: [
    // CV inputs for LiveMusicGenerationConfig
    { id: 'scale_cv_in', name: 'Scale CV', type: 'any', description: 'Modulates Lyria Scale (expects string matching GenAIScale value)' }, // Type 'any' for now, could be specific if we map numbers to scales
    { id: 'brightness_cv_in', name: 'Brightness CV', type: 'number', description: 'Modulates Lyria Brightness (0-1)' },
    { id: 'density_cv_in', name: 'Density CV', type: 'number', description: 'Modulates Lyria Density (0-1)' },
    { id: 'seed_cv_in', name: 'Seed CV', type: 'number', description: 'Modulates Lyria Seed (integer)' },
    { id: 'temperature_cv_in', name: 'Temperature CV', type: 'number', description: 'Modulates Lyria Temperature (e.g., 0.1-2.0)' },
    { id: 'guidance_cv_in', name: 'Guidance CV', type: 'number', description: 'Modulates Lyria Guidance Scale (e.g., 1-20)' },
    { id: 'top_k_cv_in', name: 'TopK CV', type: 'number', description: 'Modulates Lyria TopK (integer > 0)' },
    { id: 'bpm_cv_in', name: 'BPM CV', type: 'number', description: 'Modulates Lyria BPM (e.g. 60-180)' },

    // Control inputs
    { id: 'play_gate_in', name: 'Play Gate', type: 'gate', description: 'Gate for session.play() (high) / session.pause() (low)' },
    { id: 'stop_trigger_in', name: 'Stop Trigger', type: 'trigger', description: 'Trigger for session.stop() and reset' },
    { id: 'reconnect_trigger_in', name: 'Reconnect Trigger', type: 'trigger', description: 'Trigger to reconnect the Lyria session' },
    
    // Track muting inputs
    { id: 'mute_bass_gate_in', name: 'Mute Bass Gate', type: 'gate', description: 'Gate to mute bass track' },
    { id: 'mute_drums_gate_in', name: 'Mute Drums Gate', type: 'gate', description: 'Gate to mute drums track' },
    { id: 'only_bass_drums_gate_in', name: 'Only Bass & Drums Gate', type: 'gate', description: 'Gate to solo bass & drums' },
    
    // Prompt input
    { id: 'prompts_in', name: 'Prompts In', type: 'any', description: 'Array of Lyria WeightedPrompt objects [{text: string, weight: number}]' },
  ],
  outputs: [
    { id: 'audio_out', name: 'Audio Output', type: 'audio', description: 'Generated audio from Lyria LiveMusicService.' }
  ],
  parameters: createParameterDefinitions([
    { id: 'initial_prompt_text', name: 'Initial Prompt Text', type: 'text_input', defaultValue: 'cinematic lofi hip hop', description: 'Default text prompt for Lyria session.' },
    { id: 'initial_prompt_weight', name: 'Initial Prompt Weight', type: 'slider', min:0, max:1, step:0.01, defaultValue: 1.0, description: 'Weight for initial prompt.'},
    
    { id: 'scale', name: 'Scale', type: 'select', options: LYRIA_SCALE_OPTIONS, defaultValue: AppScale.C_MAJOR_A_MINOR, description: 'Lyria Scale. Overridden by CV if connected.' },
    { id: 'brightness', name: 'Brightness', type: 'slider', min:0, max:1, step:0.01, defaultValue: 0.5, description: 'Lyria Brightness (0-1). Overridden by CV.' },
    { id: 'density', name: 'Density', type: 'slider', min:0, max:1, step:0.01, defaultValue: 0.5, description: 'Lyria Density (0-1). Overridden by CV.' },
    { id: 'seed', name: 'Seed', type: 'number_input', defaultValue: 0, description: 'Lyria Seed (0 for random date-based). Overridden by CV.' }, // 0 can mean auto/date-based
    { id: 'temperature', name: 'Temperature', type: 'slider', min: 0.1, max: 2, step: 0.01, defaultValue: 1.1, description: 'Lyria Temperature. Overridden by CV.' },
    { id: 'guidance_scale', name: 'Guidance Scale', type: 'slider', min: 1, max: 20, step: 0.1, defaultValue: 7.0, description: 'Lyria Guidance Scale. Overridden by CV.' },
    { id: 'top_k', name: 'Top K', type: 'number_input', min:1, max:100, step:1, defaultValue: 40, description: 'Lyria Top K. Overridden by CV.' },
    { id: 'bpm', name: 'BPM', type: 'number_input', min:30, max:240, step:1, defaultValue: 120, description: 'Lyria BPM. Overridden by CV.' },
  ]),
  logicCode: `
// Lyria Realtime Master - Main Thread Logic
let newInternalState = { ...internalState };

// --- Handle Config Parameter Changes (CV overrides params) ---
const configChanged = 
    params.scale !== internalState.lastScale ||
    params.brightness !== internalState.lastBrightness ||
    params.density !== internalState.lastDensity ||
    params.seed !== internalState.lastSeed ||
    params.temperature !== internalState.lastTemperature ||
    params.guidance_scale !== internalState.lastGuidanceScale ||
    params.top_k !== internalState.lastTopK ||
    params.bpm !== internalState.lastBpm ||
    inputs.scale_cv_in !== internalState.lastScaleCv ||
    inputs.brightness_cv_in !== internalState.lastBrightnessCv ||
    inputs.density_cv_in !== internalState.lastDensityCv ||
    inputs.seed_cv_in !== internalState.lastSeedCv ||
    inputs.temperature_cv_in !== internalState.lastTemperatureCv ||
    inputs.guidance_cv_in !== internalState.lastGuidanceCv ||
    inputs.top_k_cv_in !== internalState.lastTopKCv ||
    inputs.bpm_cv_in !== internalState.lastBpmCv;

if (configChanged) {
    newInternalState.configUpdateNeeded = true;
    newInternalState.lastScale = params.scale;
    newInternalState.lastBrightness = params.brightness;
    newInternalState.lastDensity = params.density;
    newInternalState.lastSeed = params.seed;
    newInternalState.lastTemperature = params.temperature;
    newInternalState.lastGuidanceScale = params.guidance_scale;
    newInternalState.lastTopK = params.top_k;
    newInternalState.lastBpm = params.bpm;
    newInternalState.lastScaleCv = inputs.scale_cv_in;
    newInternalState.lastBrightnessCv = inputs.brightness_cv_in;
    newInternalState.lastDensityCv = inputs.density_cv_in;
    newInternalState.lastSeedCv = inputs.seed_cv_in;
    newInternalState.lastTemperatureCv = inputs.temperature_cv_in;
    newInternalState.lastGuidanceCv = inputs.guidance_cv_in;
    newInternalState.lastTopKCv = inputs.top_k_cv_in;
    newInternalState.lastBpmCv = inputs.bpm_cv_in;
    __custom_block_logger__("Lyria config params or CV changed. Flagging for update.");
}


// --- Handle Prompts ---
const promptsInput = inputs.prompts_in;
const initialPromptText = params.initial_prompt_text;
const initialPromptWeight = params.initial_prompt_weight;
let effectivePrompts = [];
if (promptsInput && Array.isArray(promptsInput) && promptsInput.length > 0) {
    effectivePrompts = promptsInput.filter(p => p && typeof p.text === 'string' && typeof p.weight === 'number');
} else if (initialPromptText && initialPromptText.trim() !== "") {
    effectivePrompts = [{ text: initialPromptText.trim(), weight: initialPromptWeight }];
}
if (JSON.stringify(effectivePrompts) !== JSON.stringify(internalState.lastEffectivePrompts)) {
    newInternalState.promptsUpdateNeeded = true;
    newInternalState.lastEffectivePrompts = effectivePrompts;
     __custom_block_logger__(\`Lyria prompts changed. Flagging for update. Num prompts: \${effectivePrompts.length}\`);
}

// --- Handle Play/Pause/Stop/Reconnect/Restart ---
// internalState.isPlaying is updated by App.tsx based on service feedback
// internalState.wasPausedDueToGateLow helps gate logic avoid re-triggering play if already playing.

const playGate = !!inputs.play_gate_in;
const stopTrigger = inputs.stop_trigger_in;
const reconnectTrigger = inputs.reconnect_trigger_in;
const UIRestartRequest = internalState.restartRequest;

if (UIRestartRequest) {
    newInternalState.stopRequest = true;
    newInternalState.playRequest = true;
    newInternalState.pauseRequest = false;
    newInternalState.restartRequest = false; // Consume UI request
    newInternalState.wasPausedDueToGateLow = false; // Reset this on restart
    __custom_block_logger__("UI Restart triggered. Requesting stop then play.");
} else if (stopTrigger && (internalState.prevStopTrigger === false || internalState.prevStopTrigger === undefined)) {
    newInternalState.stopRequest = true;
    newInternalState.playRequest = false;
    newInternalState.pauseRequest = false;
    newInternalState.wasPausedDueToGateLow = false; // Reset this on stop
    __custom_block_logger__("Stop trigger received. Requesting stop.");
} else if (playGate) {
    if (!internalState.isPlaying || internalState.wasPausedDueToGateLow) {
        newInternalState.playRequest = true;
        newInternalState.pauseRequest = false;
        newInternalState.wasPausedDueToGateLow = false;
        __custom_block_logger__("Play gate high. Requesting play.");
    }
} else { // Play gate is low
    if (internalState.isPlaying && !newInternalState.stopRequest && !newInternalState.playRequest) { // Only pause if playing and no other command active
        newInternalState.pauseRequest = true;
        newInternalState.playRequest = false;
        newInternalState.wasPausedDueToGateLow = true;
        __custom_block_logger__("Play gate low. Requesting pause.");
    }
}
newInternalState.prevStopTrigger = stopTrigger;

if (reconnectTrigger && (internalState.prevReconnectTrigger === false || internalState.prevReconnectTrigger === undefined)) {
    newInternalState.reconnectRequest = true;
    __custom_block_logger__("Reconnect trigger received. Requesting reconnect.");
}
newInternalState.prevReconnectTrigger = reconnectTrigger;


// --- Handle Track Muting ---
const muteBassGate = !!inputs.mute_bass_gate_in;
const muteDrumsGate = !!inputs.mute_drums_gate_in;
const onlyBassDrumsGate = !!inputs.only_bass_drums_gate_in;
if (muteBassGate !== internalState.lastMuteBass || 
    muteDrumsGate !== internalState.lastMuteDrums || 
    onlyBassDrumsGate !== internalState.lastOnlyBassDrums) {
    newInternalState.trackMuteUpdateNeeded = true;
    newInternalState.lastMuteBass = muteBassGate;
    newInternalState.lastMuteDrums = muteDrumsGate;
    newInternalState.lastOnlyBassDrums = onlyBassDrumsGate;
    __custom_block_logger__(\`Track mute states changed. Bass: \${muteBassGate}, Drums: \${muteDrumsGate}, OnlyBassDrums: \${onlyBassDrumsGate}\`);
}

return newInternalState;
  `.trim(),
  initialPrompt: 'Create a Lyria Realtime Master block that interfaces with the LiveMusicService. It should manage playback (play, pause, stop, reconnect), prompts, and various music generation parameters (scale, brightness, density, seed, temperature, guidance, top_k, bpm) via inputs and parameters. Also include track muting controls (muteBass, muteDrums, onlyBassAndDrums). The block itself does not generate audio worklet code; it controls the service.',
};

export const LYRIA_PROMPT_BLOCK_DEFINITION: BlockDefinition = {
  id: 'lyria-realtime-prompt-v1',
  name: 'Lyria Realtime Prompt',
  description: 'Creates a single prompt object for Lyria with text and weight.',
  inputs: [
    { id: 'text_in', name: 'Text In', type: 'string', description: 'Overrides prompt text parameter.' },
    { id: 'weight_in', name: 'Weight In', type: 'number', description: 'Overrides prompt weight parameter (0-1).' }
  ],
  outputs: [
    { id: 'prompt_out', name: 'Prompt Object', type: 'any', description: '{text: string, weight: number}' }
  ],
  parameters: createParameterDefinitions([
    { id: 'prompt_text', name: 'Prompt Text', type: 'text_input', defaultValue: '', description: 'Text content of the prompt.' },
    { id: 'prompt_weight', name: 'Weight', type: 'slider', min: 0, max: 1, step: 0.01, defaultValue: 0.5, description: 'Weight of the prompt (0.0 to 1.0).' }
  ]),
  logicCode: `
// Lyria Realtime Prompt Block Logic
const textParam = params.prompt_text;
const weightParam = params.prompt_weight;

const textInput = inputs.text_in;
const weightInput = inputs.weight_in; // number between 0 and 1

const effectiveText = (textInput !== null && textInput !== undefined && typeof textInput === 'string' && textInput.trim() !== "") ? textInput : textParam;
let effectiveWeight = weightParam;

if (weightInput !== null && weightInput !== undefined && typeof weightInput === 'number' && !isNaN(weightInput)) {
  effectiveWeight = Math.max(0, Math.min(1, weightInput)); // Clamp to 0-1
}

const promptObject = {
  text: effectiveText,
  weight: effectiveWeight
};

setOutput('prompt_out', promptObject);
// __custom_block_logger__(\`Lyria Prompt: \${JSON.stringify(promptObject)}\`);

return {};
  `.trim(),
  initialPrompt: 'Create a Lyria Realtime Prompt block. Inputs: text_in (string), weight_in (number 0-1). Outputs: prompt_out (any, for {text, weight} object). Parameters: "Prompt Text" (text_input), "Prompt Weight" (slider 0-1). Logic forms the output object from inputs or parameters.',
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
  OSCILLATOR_BLOCK_DEFINITION,
  MANUAL_GATE_BLOCK_DEFINITION,
  STEP_SEQUENCER_BLOCK_DEFINITION,
  PROBABILITY_SEQUENCER_BLOCK_DEFINITION,
  RULE_110_BLOCK_DEFINITION,
  RULE_110_OSCILLATOR_BLOCK_DEFINITION,
  RULE_110_JOIN_BLOCK_DEFINITION,
  RULE_110_BYTE_READER_BLOCK_DEFINITION,
  BYTE_REVERSE_BLOCK_DEFINITION,
  LYRIA_MASTER_BLOCK_DEFINITION,
  LYRIA_PROMPT_BLOCK_DEFINITION,
];
