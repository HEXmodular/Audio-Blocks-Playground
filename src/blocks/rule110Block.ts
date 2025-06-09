
import { BlockDefinition } from '../types';
import { createParameterDefinitions, BPM_FRACTIONS } from '../constants';

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
