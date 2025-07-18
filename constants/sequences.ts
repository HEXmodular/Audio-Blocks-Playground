import { BlockDefinition } from "@interfaces/common";
import { BPM_FRACTIONS, createParameterDefinitions } from "@constants/constants";

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