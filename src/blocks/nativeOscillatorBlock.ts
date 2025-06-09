
import { BlockDefinition } from '../types';
import { createParameterDefinitions, NATIVE_LOGIC_CODE_PLACEHOLDER } from '../constants';

export const NATIVE_OSCILLATOR_BLOCK_DEFINITION: BlockDefinition = {
  id: 'native-oscillator-v1',
  name: 'Oscillator (Native)',
  description: 'Generates a basic waveform using a native Web Audio API OscillatorNode and an internal GainNode for amplitude.',
  runsAtAudioRate: true,
  inputs: [
    { id: 'freq_in', name: 'Frequency CV', type: 'audio', description: 'Modulates OscillatorNode.frequency AudioParam directly.', audioParamTarget: 'frequency' },
  ],
  outputs: [
    { id: 'audio_out', name: 'Audio Output', type: 'audio', description: 'The generated audio signal (from internal GainNode).' }
  ],
  parameters: createParameterDefinitions([
    { id: 'frequency', name: 'Frequency', type: 'slider', min: 20, max: 5000, step: 1, defaultValue: 440, description: 'Base frequency in Hz (OscillatorNode.frequency).', isFrequency: true },
    { id: 'waveform', name: 'Waveform', type: 'select', options: [{value: 'sine', label: 'Sine'}, {value: 'square', label: 'Square'}, {value: 'sawtooth', label: 'Sawtooth'}, {value: 'triangle', label: 'Triangle'}], defaultValue: 'sine', description: 'Shape of the waveform (OscillatorNode.type).' },
    { id: 'gain', name: 'Gain/CV Depth', type: 'slider', min: 0, max: 200, step: 0.1, defaultValue: 0.5, description: 'Output amplitude or CV modulation depth. Controls an internal GainNode.' }
  ]),
  logicCode: NATIVE_LOGIC_CODE_PLACEHOLDER,
  initialPrompt: 'Create an audio oscillator block using a native Web Audio API OscillatorNode. It should have frequency, waveform type (sine, square, sawtooth, triangle), and gain parameters. The gain should control an internal GainNode. It needs an audio input for frequency CV. No trigger input for phase reset.',
};
