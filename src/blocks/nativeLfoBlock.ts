
import { BlockDefinition } from '../types';
import { createParameterDefinitions, NATIVE_LOGIC_CODE_PLACEHOLDER } from '../constants';

export const NATIVE_LFO_BLOCK_DEFINITION: BlockDefinition = {
  id: 'native-lfo-v1',
  name: 'LFO (Native)',
  description: 'Low-Frequency Oscillator using a native OscillatorNode. Max frequency 200Hz. Outputs an audio-rate signal, typically used for modulation.',
  runsAtAudioRate: true,
  inputs: [
    { id: 'freq_cv_in', name: 'Frequency CV', type: 'audio', description: 'Modulates LFO frequency.', audioParamTarget: 'frequency' },
  ],
  outputs: [
    { id: 'audio_out', name: 'LFO Output', type: 'audio', description: 'The LFO signal.' }
  ],
  parameters: createParameterDefinitions([
    { id: 'frequency', name: 'Frequency (Hz)', type: 'slider', min: 0.01, max: 200, step: 0.01, defaultValue: 1, description: 'LFO frequency in Hz.', isFrequency: true },
    { id: 'waveform', name: 'Waveform', type: 'select', options: [{value: 'sine', label: 'Sine'}, {value: 'square', label: 'Square'}, {value: 'sawtooth', label: 'Sawtooth'}, {value: 'triangle', label: 'Triangle'}], defaultValue: 'sine', description: 'LFO waveform shape.' },
    { id: 'gain', name: 'Amplitude', type: 'slider', min: 0, max: 10, step: 0.1, defaultValue: 1, description: 'Amplitude of the LFO signal (controls internal GainNode).' }
  ]),
  logicCode: NATIVE_LOGIC_CODE_PLACEHOLDER,
  initialPrompt: 'Create a native LFO block using an OscillatorNode. Max frequency 200Hz. Parameters: frequency (0.01-200Hz), waveform, amplitude. Input: frequency CV. Output: LFO audio signal.',
};
