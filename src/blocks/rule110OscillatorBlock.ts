
import { BlockDefinition } from '../types';
import { createParameterDefinitions } from '../constants';

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
