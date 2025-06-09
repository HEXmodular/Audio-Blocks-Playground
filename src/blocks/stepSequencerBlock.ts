
import { BlockDefinition } from '../types';
import { createParameterDefinitions, SEQUENCER_BPM_FRACTIONS } from '../constants';

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
