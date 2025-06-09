
import { BlockDefinition } from '../types';
import { createParameterDefinitions } from '../constants';

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
  parameters: createParameterDefinitions([ 
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
