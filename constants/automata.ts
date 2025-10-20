// import { BlockDefinition } from "@interfaces";
// import { BPM_FRACTIONS, createParameterDefinitions } from "@constants/constants";

// export const RULE_110_BLOCK_DEFINITION: BlockDefinition = {
//   id: 'rule-110-automaton-v1',
//   name: 'Rule 110 Automaton',
//   description: '1D cellular automaton (Rule 110). Outputs next state as a number. Can run on internal clock or external trigger. Includes LFO mode.',
//   inputs: [
//     { id: 'trigger_in', name: 'Trigger', type: 'trigger', description: 'Advances automaton one step.' },
//     { id: 'numeric_state_in', name: 'Numeric State In', type: 'number', description: 'Overrides internal state with this number if connected.'}
//   ],
//   outputs: [
//     { id: 'numeric_state_out', name: 'Numeric State Out', type: 'number', description: 'The numeric representation of the core cells of the next state.' }
//   ],
//   parameters: createParameterDefinitions([
//     { id: 'core_length', name: 'Core Length (N)', type: 'slider', min: 1, max: 16, step: 1, defaultValue: 8, description: 'Number of core cells (excluding boundaries).' },
//     { id: 'initial_pattern_plus_boundaries', name: 'Pattern + Boundaries', type: 'step_sequencer_ui', defaultValue: Array(18).fill(false), steps: 18, description: 'Initial state for L-Boundary, N Core cells, R-Boundary, and unused cells. Max 16 core + 2 boundaries = 18 total.' },
//     { id: 'run_mode', name: 'Run Mode', type: 'select', options: [{value: 'internal_trigger', label: 'Internal Trigger'}, {value: 'external_trigger', label: 'External Trigger'}, {value: 'lfo', label: 'LFO Mode'}], defaultValue: 'internal_trigger', description: 'Clock source for automaton updates.' },
//     { id: 'internal_freq_hz', name: 'Internal Freq (Hz)', type: 'number_input', min: 0.01, max: 8000, defaultValue: 10, description: 'Frequency for Internal Trigger or LFO mode (Hz).', isFrequency: true },
//     { id: 'lfo_bpm_sync_rate', name: 'LFO BPM Sync Rate', type: 'select', options: BPM_FRACTIONS, defaultValue: 0.25, description: 'Rate for LFO mode if BPM synced (overrides Hz if selected).'},
//     { id: 'lfo_sync_to_bpm', name: 'LFO Sync to BPM', type: 'toggle', defaultValue: false, description: 'Enable BPM sync for LFO mode.'}
//   ]),
//   logicCode: `
// const coreLength = Math.max(1, Math.min(16, params.core_length));
// const totalPatternLength = coreLength + 2; // L-Boundary + Core + R-Boundary
// let currentPattern = internalState.currentPattern || [...(params.initial_pattern_plus_boundaries || [])].slice(0, totalPatternLength);
// if (currentPattern.length !== totalPatternLength) { // Adjust if coreLength changed
//   const defaultPattern = [...(params.initial_pattern_plus_boundaries || [])];
//   currentPattern = Array(totalPatternLength).fill(false).map((_,i) => defaultPattern[i] === true);
// }

// const numericStateIn = inputs.numeric_state_in;
// if (numericStateIn !== null && numericStateIn !== undefined && typeof numericStateIn === 'number' && isFinite(numericStateIn)) {
//   const maxVal = (1 << coreLength) -1;
//   const intVal = Math.max(0, Math.min(maxVal, Math.floor(numericStateIn)));
//   for (let i = 0; i < coreLength; i++) {
//     currentPattern[i + 1] = (intVal & (1 << (coreLength - 1 - i))) !== 0;
//   }
//   // __custom_block_logger__(\`External state applied: \${intVal}, Pattern: \${currentPattern.slice(1, coreLength+1).map(b=>b?1:0).join('')}\`);
// }

// const RULE_110_MAP = [0,1,1,1,0,1,1,0]; // For neighborhoods: 111 to 000 -> output bit

// function applyRule110(left, middle, right) {
//   const index = (left ? 4 : 0) + (middle ? 2 : 0) + (right ? 1 : 0);
//   return RULE_110_MAP[index] === 1;
// }

// function stepAutomaton() {
//   const nextPattern = [...currentPattern];
//   for (let i = 0; i < coreLength; ++i) { // Iterate core cells
//     const leftNeighbor = currentPattern[i];     // Cell at index i is left neighbor of core cell i+1
//     const currentCell  = currentPattern[i + 1]; // Core cell
//     const rightNeighbor= currentPattern[i + 2]; // Cell at index i+2 is right neighbor of core cell i+1
//     nextPattern[i + 1] = applyRule110(leftNeighbor, currentCell, rightNeighbor);
//   }
//   currentPattern = nextPattern;
//   internalState.currentPattern = currentPattern;

//   let numericOutput = 0;
//   for (let i = 0; i < coreLength; ++i) {
//     if (currentPattern[i + 1]) { // Core cells are from index 1 to coreLength
//       numericOutput |= (1 << (coreLength - 1 - i));
//     }
//   }
//   setOutput('numeric_state_out', numericOutput);
//   // __custom_block_logger__(\`Stepped. Core: \${currentPattern.slice(1, coreLength+1).map(b=>b?1:0).join('')}, Out: \${numericOutput}\`);
// }

// // Timing logic
// const runMode = params.run_mode;
// const externalTrigger = inputs.trigger_in;
// const internalFreqHz = params.internal_freq_hz;
// const lfoBpmSync = params.lfo_sync_to_bpm;
// const lfoBpmFraction = parseFloat(params.lfo_bpm_sync_rate);

// const bpm = audioContextInfo ? audioContextInfo.bpm : 120;
// const sampleRate = audioContextInfo ? audioContextInfo.sampleRate : 44100;
// const samplesPerBlock = 128;

// let effectiveFreqHz;
// if (runMode === 'lfo' && lfoBpmSync) {
//   const beatsPerStep = lfoBpmFraction;
//   const secondsPerBeat = 60.0 / bpm;
//   const secondsPerStep = secondsPerBeat * beatsPerStep;
//   effectiveFreqHz = 1.0 / secondsPerStep;
// } else {
//   effectiveFreqHz = internalFreqHz;
// }

// const samplesPerStepInternal = Math.max(1, Math.round(sampleRate / effectiveFreqHz));
// let timeSinceLastInternalStep = internalState.timeSinceLastInternalStep || 0;

// if (runMode === 'internal_trigger' || runMode === 'lfo') {
//   timeSinceLastInternalStep += samplesPerBlock;
//   if (timeSinceLastInternalStep >= samplesPerStepInternal) {
//     stepAutomaton();
//     timeSinceLastInternalStep = 0;
//   }
// } else if (runMode === 'external_trigger') {
//   if (externalTrigger === true && (internalState.prevExtTriggerState === false || internalState.prevExtTriggerState === undefined)) {
//     stepAutomaton();
//   }
// }
// internalState.timeSinceLastInternalStep = timeSinceLastInternalStep;
// internalState.prevExtTriggerState = externalTrigger;

// return internalState;
//   `.trim(),
//   initialPrompt: 'Create a Rule 110 cellular automaton block. Parameters: "Core Length" (slider 1-16), "Pattern + Boundaries" (step_sequencer_ui, 18 steps for L-Bnd, N core, R-Bnd), "Run Mode" (select: Internal Trigger, External Trigger, LFO), "Internal Freq (Hz)" (number_input 0.01-8000), "LFO BPM Sync Rate" (select), "LFO Sync to BPM" (toggle). Inputs: "Trigger", "Numeric State In". Output: "Numeric State Out". Logic must implement Rule 110, handle timing for different modes, and convert core pattern to/from number. Max 16 core cells + 2 boundaries = 18 UI steps.',
// };

// const RULE_110_OSCILLATOR_WORKLET_PROCESSOR_NAME = 'rule-110-oscillator-processor';
// const RULE_110_OSCILLATOR_WORKLET_CODE = `
// // Rule 110 Oscillator Worklet Processor
// class Rule110OscillatorProcessor extends AudioWorkletProcessor {
//   static get parameterDescriptors() {
//     return [
//       { name: 'gain', defaultValue: 1, minValue: 0, maxValue: 10, automationRate: 'a-rate' },
//       // Frequency is controlled by sample rate (CV into logic) and internal rule 110 speed.
//       // The worklet itself doesn't have a frequency AudioParam directly tied to pitch.
//     ];
//   }

//   constructor(options) {
//     super(options);
//     this.coreLength = options?.processorOptions?.coreLength || 8;
//     this.outputMode = options?.processorOptions?.outputMode || 'sum_bits'; // 'sum_bits' or 'center_bit'
    
//     // Initialize pattern: L-Boundary + Core + R-Boundary
//     this.totalPatternLength = this.coreLength + 2;
//     this.pattern = new Array(this.totalPatternLength).fill(false);
//     const initialPatternParam = options?.processorOptions?.initialPattern || [];
//     for(let i=0; i < Math.min(this.totalPatternLength, initialPatternParam.length); ++i) {
//       this.pattern[i] = initialPatternParam[i] === true;
//     }

//     this.samplesSinceLastStep = 0;
//     this.samplesPerRuleStep = options?.processorOptions?.samplesPerRuleStep || Math.round(sampleRate / 100); // Default 100 Hz update for Rule 110
    
//     this.RULE_110_MAP = [0,1,1,1,0,1,1,0]; // For 111 to 000

//     this.port.onmessage = (event) => {
//       if (event.data?.type === 'SET_SAMPLES_PER_RULE_STEP') {
//         this.samplesPerRuleStep = Math.max(1, Math.round(event.data.value));
//       }
//       if (event.data?.type === 'SET_PATTERN') {
//          const newPatternArray = event.data.pattern; // Should be boolean array
//          if (Array.isArray(newPatternArray) && newPatternArray.length === this.totalPatternLength) {
//            this.pattern = [...newPatternArray];
//          }
//       }
//       if (event.data?.type === 'SET_CORE_LENGTH') {
//         this.coreLength = event.data.coreLength;
//         this.totalPatternLength = this.coreLength + 2;
//         // Re-initialize pattern based on new coreLength, possibly from a new full pattern if sent
//         const currentFullPattern = event.data.fullPatternAfterResize || []; // Assume host sends adjusted pattern
//         this.pattern = new Array(this.totalPatternLength).fill(false);
//         for(let i=0; i < Math.min(this.totalPatternLength, currentFullPattern.length); ++i) {
//           this.pattern[i] = currentFullPattern[i] === true;
//         }
//       }
//        if (event.data?.type === 'SET_OUTPUT_MODE') {
//         this.outputMode = event.data.outputMode;
//       }
//     };
//   }

//   applyRule110(left, middle, right) {
//     const index = (left ? 4 : 0) + (middle ? 2 : 0) + (right ? 1 : 0);
//     return this.RULE_110_MAP[index] === 1;
//   }

//   stepAutomaton() {
//     const nextPattern = [...this.pattern];
//     for (let i = 0; i < this.coreLength; ++i) {
//       const leftNeighbor = this.pattern[i];
//       const currentCell  = this.pattern[i + 1];
//       const rightNeighbor= this.pattern[i + 2];
//       nextPattern[i + 1] = this.applyRule110(leftNeighbor, currentCell, rightNeighbor);
//     }
//     this.pattern = nextPattern;
//   }

//   getOutputSample() {
//     if (this.outputMode === 'center_bit') {
//       const centerIndex = Math.floor(this.coreLength / 2) + 1; // +1 for L-Boundary offset
//       return this.pattern[centerIndex] ? 1.0 : -1.0;
//     } else { // 'sum_bits' (default)
//       let sum = 0;
//       for (let i = 0; i < this.coreLength; ++i) {
//         if (this.pattern[i + 1]) { // Core cells are from index 1 to coreLength
//           sum++;
//         }
//       }
//       // Normalize sum to -1 to 1 range. Max sum is coreLength.
//       if (this.coreLength === 0) return 0;
//       return (sum / this.coreLength) * 2.0 - 1.0;
//     }
//   }

//   process(inputs, outputs, parameters) {
//     const output = outputs[0];
//     const outputChannel = output[0];
//     const gainValues = parameters.gain;

//     for (let i = 0; i < outputChannel.length; ++i) {
//       if (this.samplesSinceLastStep >= this.samplesPerRuleStep) {
//         this.stepAutomaton();
//         this.samplesSinceLastStep = 0;
//       }
//       const gain = gainValues.length > 1 ? gainValues[i] : gainValues[0];
//       outputChannel[i] = this.getOutputSample() * gain;
//       this.samplesSinceLastStep++;
//     }
//     return true;
//   }
// }
// `;
// export const RULE_110_OSCILLATOR_BLOCK_DEFINITION: BlockDefinition = {
//   id: 'rule-110-oscillator-v1',
//   name: 'Rule 110 Oscillator',
//   description: 'Oscillator using Rule 110 automaton for sound generation via AudioWorklet. CV input controls Rule 110 update rate.',
//   runsAtAudioRate: true,
//   inputs: [
//     { id: 'rate_cv_in', name: 'Rate CV', type: 'audio', description: 'Controls update rate of the Rule 110 automaton (higher CV = faster updates).' }
//   ],
//   outputs: [
//     { id: 'audio_out', name: 'Audio Out', type: 'audio', description: 'Generated audio signal from the automaton.' }
//   ],
//   parameters: createParameterDefinitions([
//     { id: 'core_length', name: 'Core Length (N)', type: 'slider', min: 1, max: 16, step: 1, defaultValue: 8, description: 'Number of core cells for the automaton.' },
//     { id: 'initial_pattern_plus_boundaries', name: 'Pattern + Boundaries', type: 'step_sequencer_ui', defaultValue: Array(18).fill(false), steps: 18, description: 'Initial state including boundaries.' },
//     { id: 'base_update_rate_hz', name: 'Base Update Rate (Hz)', type: 'slider', min: 1, max: 20000, step: 1, defaultValue: 440, description: 'Base internal update frequency of the Rule 110 automaton.', isFrequency: true },
//     { id: 'cv_sensitivity', name: 'CV Sensitivity', type: 'slider', min: 0, max: 5000, step: 1, defaultValue: 1000, description: 'Multiplier for rate_cv_in to modulate update rate.' },
//     { id: 'output_mode', name: 'Output Mode', type: 'select', options: [{value: 'sum_bits', label: 'Sum Bits'}, {value: 'center_bit', label: 'Center Bit'}], defaultValue: 'sum_bits', description: 'Method to generate audio sample from pattern.' },
//     { id: 'gain', name: 'Gain', type: 'slider', min: 0, max: 1, step: 0.01, defaultValue: 0.5, description: 'Output amplitude (controls AudioParam in worklet).' }
//   ]),
//   logicCode: `
// // Main thread logic for Rule 110 Oscillator
// const baseRateHz = params.base_update_rate_hz;
// const cvSensitivity = params.cv_sensitivity;
// const rateCV = inputs.rate_cv_in; // Expected to be audio-rate, effectively 0 if not connected.

// // Rate CV is audio, typically -1 to 1. We want it to modulate positively around baseRate.
// // Map CV from [-1, 1] to a multiplier, e.g., [0.1, 10] or similar.
// // Let's say CV of 0 means base rate. CV of 1 means baseRate + cvSensitivity. CV of -1 means baseRate - cvSensitivity (clamped).
// // A simpler approach for audio CV: treat it as a direct addition to frequency, scaled by sensitivity.
// // If rateCV is an audio signal, it will average to 0 over time if not DC biased.
// // For this example, let's assume it provides a control value.
// // If rateCV input is not connected, inputs.rate_cv_in will be 0.
// const modulatedRateHz = Math.max(1, baseRateHz + (rateCV * cvSensitivity)); // Ensure positive rate

// const sampleRate = audioContextInfo ? audioContextInfo.sampleRate : 44100;
// const samplesPerRuleStep = Math.max(1, Math.round(sampleRate / modulatedRateHz));

// if (postMessageToWorklet) {
//   if (internalState.lastSamplesPerRuleStep !== samplesPerRuleStep) {
//     postMessageToWorklet({ type: 'SET_SAMPLES_PER_RULE_STEP', value: samplesPerRuleStep });
//     internalState.lastSamplesPerRuleStep = samplesPerRuleStep;
//   }
  
//   const currentPattern = params.initial_pattern_plus_boundaries;
//   if (JSON.stringify(internalState.lastPatternSent) !== JSON.stringify(currentPattern)) {
//     postMessageToWorklet({ type: 'SET_PATTERN', pattern: currentPattern });
//     internalState.lastPatternSent = [...currentPattern];
//   }
  
//   const coreLength = params.core_length;
//   if (internalState.lastCoreLength !== coreLength) {
//     postMessageToWorklet({ type: 'SET_CORE_LENGTH', coreLength: coreLength, fullPatternAfterResize: currentPattern });
//     internalState.lastCoreLength = coreLength;
//      __custom_block_logger__(\`Rule110Osc: Core length changed to \${coreLength}. Pattern may need UI refresh.\`);
//   }

//   const outputMode = params.output_mode;
//   if (internalState.lastOutputMode !== outputMode) {
//     postMessageToWorklet({ type: 'SET_OUTPUT_MODE', outputMode: outputMode });
//     internalState.lastOutputMode = outputMode;
//   }
// }
// // Gain is handled by AudioParam in worklet, host updates it from params.gain

// return internalState;
//   `.trim(),
//   initialPrompt: 'Create a Rule 110 Oscillator. It uses a Rule 110 automaton in an AudioWorklet. Parameters: "Core Length", "Pattern + Boundaries", "Base Update Rate (Hz)", "CV Sensitivity", "Output Mode" (Sum Bits/Center Bit), "Gain". Inputs: "Rate CV" (audio). Output: "Audio Output". Logic code sends params to worklet. Worklet runs automaton, generates audio based on selected mode and pattern state, modulated by CV.',
//   audioWorkletProcessorName: RULE_110_OSCILLATOR_WORKLET_PROCESSOR_NAME,
//   audioWorkletCode: RULE_110_OSCILLATOR_WORKLET_CODE,
// };

// export const RULE_110_JOIN_BLOCK_DEFINITION: BlockDefinition = {
//   id: 'rule-110-join-v1',
//   name: 'Rule 110 Join',
//   description: 'Joins two numeric states for a Rule 110 automaton, computes next step, splits, and outputs.',
//   inputs: [
//     { id: 'numeric_state_in_1', name: 'Numeric State In 1', type: 'number', description: 'First part of the automaton state.' },
//     { id: 'numeric_state_in_2', name: 'Numeric State In 2', type: 'number', description: 'Second part of the automaton state.' },
//     { id: 'trigger_in', name: 'Trigger', type: 'trigger', description: 'Advances automaton one step.' }
//   ],
//   outputs: [
//     { id: 'numeric_state_out_1', name: 'Numeric State Out 1', type: 'number', description: 'First part of the next state.' },
//     { id: 'numeric_state_out_2', name: 'Numeric State Out 2', type: 'number', description: 'Second part of the next state.' }
//   ],
//   parameters: createParameterDefinitions([
//     { id: 'core_length_1', name: 'Core Length 1 (N1)', type: 'slider', min: 1, max: 8, step: 1, defaultValue: 4, description: 'Number of bits for state 1.' },
//     { id: 'core_length_2', name: 'Core Length 2 (N2)', type: 'slider', min: 1, max: 8, step: 1, defaultValue: 4, description: 'Number of bits for state 2.' },
//     { id: 'boundary_bits_handling', name: 'Boundary Bits', type: 'select', options: [{value:'zero', label:'Zeros'}, {value:'one', label:'Ones'}, {value:'wrap', label:'Wrap Around'}], defaultValue: 'zero', description: 'How to handle boundary bits for the combined automaton.'}
//   ]),
//   logicCode: `
// const N1 = Math.max(1, Math.min(8, params.core_length_1));
// const N2 = Math.max(1, Math.min(8, params.core_length_2));
// const totalCoreLength = N1 + N2;

// const stateIn1 = inputs.numeric_state_in_1;
// const stateIn2 = inputs.numeric_state_in_2;
// const trigger = inputs.trigger_in;

// const RULE_110_MAP = [0,1,1,1,0,1,1,0];

// function applyRule110(left, middle, right) {
//   const index = (left ? 4 : 0) + (middle ? 2 : 0) + (right ? 1 : 0);
//   return RULE_110_MAP[index] === 1;
// }

// // Initialize pattern if not present or if lengths changed
// if (!internalState.currentPattern || internalState.N1 !== N1 || internalState.N2 !== N2) {
//   internalState.currentPattern = new Array(totalCoreLength + 2).fill(false); // +2 for L/R boundaries
//   internalState.N1 = N1;
//   internalState.N2 = N2;
//    __custom_block_logger__(\`Pattern re-initialized for N1=\${N1}, N2=\${N2}\`);
// }
// let currentPattern = internalState.currentPattern;

// // Apply inputs to pattern if available
// if (stateIn1 !== null && typeof stateIn1 === 'number') {
//   const maxVal1 = (1 << N1) - 1;
//   const intVal1 = Math.max(0, Math.min(maxVal1, Math.floor(stateIn1)));
//   for (let i = 0; i < N1; i++) {
//     currentPattern[i + 1] = (intVal1 & (1 << (N1 - 1 - i))) !== 0; // Bit 0 of stateIn1 is MSB of N1 part
//   }
// }
// if (stateIn2 !== null && typeof stateIn2 === 'number') {
//   const maxVal2 = (1 << N2) - 1;
//   const intVal2 = Math.max(0, Math.min(maxVal2, Math.floor(stateIn2)));
//   for (let i = 0; i < N2; i++) {
//     currentPattern[N1 + i + 1] = (intVal2 & (1 << (N2 - 1 - i))) !== 0; // Bit 0 of stateIn2 is MSB of N2 part
//   }
// }

// if (trigger === true && (internalState.prevTriggerState === false || internalState.prevTriggerState === undefined)) {
//   const boundaryMode = params.boundary_bits_handling;
//   // Set boundary bits before stepping
//   if (boundaryMode === 'zero') {
//     currentPattern[0] = false; // Left boundary
//     currentPattern[totalCoreLength + 1] = false; // Right boundary
//   } else if (boundaryMode === 'one') {
//     currentPattern[0] = true;
//     currentPattern[totalCoreLength + 1] = true;
//   } else { // wrap
//     currentPattern[0] = currentPattern[totalCoreLength]; // L-bnd = last core cell of combined
//     currentPattern[totalCoreLength + 1] = currentPattern[1]; // R-bnd = first core cell of combined
//   }
  
//   const nextPattern = [...currentPattern];
//   for (let i = 0; i < totalCoreLength; ++i) { // Iterate all core cells (N1+N2)
//     const leftNeighbor = currentPattern[i];
//     const currentCell  = currentPattern[i + 1];
//     const rightNeighbor= currentPattern[i + 2];
//     nextPattern[i + 1] = applyRule110(leftNeighbor, currentCell, rightNeighbor);
//   }
//   currentPattern = nextPattern;
//   internalState.currentPattern = currentPattern;

//   let numericOutput1 = 0;
//   for (let i = 0; i < N1; ++i) {
//     if (currentPattern[i + 1]) {
//       numericOutput1 |= (1 << (N1 - 1 - i));
//     }
//   }
//   setOutput('numeric_state_out_1', numericOutput1);

//   let numericOutput2 = 0;
//   for (let i = 0; i < N2; ++i) {
//     if (currentPattern[N1 + i + 1]) {
//       numericOutput2 |= (1 << (N2 - 1 - i));
//     }
//   }
//   setOutput('numeric_state_out_2', numericOutput2);
//   // __custom_block_logger__(\`Join: Stepped. Out1: \${numericOutput1}, Out2: \${numericOutput2}\`);
// }
// internalState.prevTriggerState = trigger;

// return internalState;
//   `.trim(),
//   initialPrompt: 'Create a Rule 110 Join block. Parameters: "Core Length 1 (N1)" (slider 1-8), "Core Length 2 (N2)" (slider 1-8), "Boundary Bits" (select: Zeros, Ones, Wrap). Inputs: "Numeric State In 1", "Numeric State In 2", "Trigger". Outputs: "Numeric State Out 1", "Numeric State Out 2". Logic combines N1 and N2 bits, applies Rule 110 with chosen boundaries, then splits the result.',
// };
 
// export const RULE_110_BYTE_READER_BLOCK_DEFINITION: BlockDefinition = {
//   id: 'rule-110-byte-reader-v1',
//   name: 'Rule 110 Byte Reader',
//   description: 'Reads a specific bit from incoming Rule 110 numeric states over N triggers, then outputs the collected byte (as number) and the chosen bit\'s last state.',
//   category: 'data',
//   inputs: [
//     { id: 'numeric_state_in', name: 'Numeric State In', type: 'number', description: 'Input from a Rule 110 source.'},
//     { id: 'trigger_in', name: 'Trigger', type: 'trigger', description: 'Reads one bit on trigger.'}
//   ],
//   outputs: [
//     { id: 'byte_out', name: 'Byte Out', type: 'number', description: 'Collected byte (8 bits) as a number, MSB first. Outputs when N bits are collected.'},
//     { id: 'selected_bit_out', name: 'Selected Bit Out', type: 'boolean', description: 'State of the chosen bit from the last read numeric state.'}
//   ],
//   parameters: createParameterDefinitions([
//     { id: 'rule110_core_length', name: 'Input Core Length', type: 'slider', min:1, max:16, step:1, defaultValue:8, description: 'Core length of the Rule 110 source this block reads from.'},
//     { id: 'bit_to_read', name: 'Bit to Read (0-indexed from MSB)', type: 'slider', min:0, max:15, step:1, defaultValue:0, description: 'Which bit of the input state to sample (0 is MSB).'},
//     { id: 'bits_to_collect_N', name: 'Bits to Collect (N)', type: 'slider', min:1, max:8, step:1, defaultValue:8, description: 'Number of bits to collect before outputting byte_out.'}
//   ]),
//   logicCode: `
// const coreLength = params.rule110_core_length;
// const bitToRead = Math.min(params.bit_to_read, coreLength - 1); // Ensure bit_to_read is within coreLength
// const N = params.bits_to_collect_N;

// const numericStateIn = inputs.numeric_state_in;
// const trigger = inputs.trigger_in;

// let collectedBits = internalState.collectedBits || 0;
// let bitCount = internalState.bitCount || 0;
// let lastSelectedBitState = internalState.lastSelectedBitState || false;

// if (trigger === true && (internalState.prevTriggerState === false || internalState.prevTriggerState === undefined)) {
//   if (numericStateIn !== null && typeof numericStateIn === 'number' && isFinite(numericStateIn)) {
//     // Extract the specified bit (0-indexed from MSB)
//     // (numericStateIn >> (coreLength - 1 - bitToRead)) & 1
//     const selectedBit = ( (Math.floor(numericStateIn) >> (coreLength - 1 - bitToRead)) & 1 ) === 1;
//     lastSelectedBitState = selectedBit;
    
//     collectedBits = (collectedBits << 1) | (selectedBit ? 1 : 0);
//     bitCount++;

//     if (bitCount >= N) {
//       setOutput('byte_out', collectedBits & ((1 << N) -1) ); // Output last N bits
//       // __custom_block_logger__(\`Byte output: ${collectedBits & ((1 << N) -1)} after ${N} bits.\");
//       collectedBits = 0; // Reset for next byte
//       bitCount = 0;
//     } else {
//       setOutput('byte_out', null); // No full byte yet
//     }
//   }
// }
// setOutput('selected_bit_out', lastSelectedBitState);

// internalState.collectedBits = collectedBits;
// internalState.bitCount = bitCount;
// internalState.lastSelectedBitState = lastSelectedBitState;
// internalState.prevTriggerState = trigger;

// return internalState;
//   `,
//   initialPrompt: 'Create a Rule 110 Byte Reader. Parameters: "Input Core Length" (slider 1-16), "Bit to Read (0-indexed from MSB)" (slider 0-15), "Bits to Collect (N)" (slider 1-8 for byte). Inputs: "Numeric State In", "Trigger". Outputs: "Byte Out" (number, after N bits), "Selected Bit Out" (boolean). Logic samples the chosen bit from input on trigger, accumulates N bits, then outputs byte.',
// };

