
import { BlockDefinition } from '../types';
import { createParameterDefinitions, NATIVE_LOGIC_CODE_PLACEHOLDER } from '../constants';

export const NATIVE_BIQUAD_FILTER_BLOCK_DEFINITION: BlockDefinition = {
  id: 'native-biquad-filter-v1',
  name: 'Biquad Filter (Native)',
  description: 'A standard Web Audio API BiquadFilterNode. Parameters control the underlying native node. Audio path is managed by Web Audio graph connections.',
  runsAtAudioRate: true,
  inputs: [
    { id: 'audio_in', name: 'Audio Input', type: 'audio', description: 'Connects to native BiquadFilterNode input in Web Audio graph.' },
    { id: 'freq_cv_in', name: 'Freq CV', type: 'audio', description: 'Modulates frequency AudioParam directly in Web Audio graph.', audioParamTarget: 'frequency'},
    { id: 'q_cv_in', name: 'Q CV', type: 'audio', description: 'Modulates Q AudioParam directly in Web Audio graph.', audioParamTarget: 'Q'}
  ],
  outputs: [
    { id: 'audio_out', name: 'Audio Output', type: 'audio', description: 'Output from native BiquadFilterNode in Web Audio graph.' }
  ],
  parameters: createParameterDefinitions([ 
    { id: 'frequency', name: 'Frequency', type: 'slider', min: 20, max: 20000, step: 1, defaultValue: 350, description: 'Filter cutoff/center frequency in Hz (AudioParam).', isFrequency: true },
    { id: 'q', name: 'Q Factor', type: 'slider', min: 0.0001, max: 1000, step: 0.0001, defaultValue: 1, description: 'Quality factor, controlling bandwidth (AudioParam).' },
    { id: 'gain', name: 'Gain (dB)', type: 'slider', min: -40, max: 40, step: 0.1, defaultValue: 0, description: 'Gain in decibels, for Peaking, Lowshelf, Highshelf (AudioParam).' },
    {
      id: 'type',
      name: 'Filter Type',
      type: 'select',
      options: [
        {value: "lowpass", label: "Lowpass"}, {value: "highpass", label: "Highpass"},
        {value: "bandpass", label: "Bandpass"}, {value: "notch", label: "Notch"},
        {value: "allpass", label: "Allpass"}, {value: "peaking", label: "Peaking"},
        {value: "lowshelf", label: "Lowshelf"}, {value: "highshelf", label: "Highshelf"}
      ],
      defaultValue: "lowpass",
      description: 'The type of filtering algorithm (native node property).'
    },
  ]),
  logicCode: NATIVE_LOGIC_CODE_PLACEHOLDER,
  initialPrompt: 'Standard Web Audio API BiquadFilterNode. Its parameters (frequency, Q, gain, type) should control the corresponding AudioParams/properties on the native node. It should have audio inputs for the main signal and for frequency/Q CV modulation.',
  logicCodeTests: `
describe('NativeBiquadFilter LogicCode Placeholder Tests', () => {
  it('should run without error and produce no output by default', async (context) => {
    context.resetTestContext();
    // Inputs to logicCode are for main-thread control, not direct audio samples for native node.
    const inputs = { audio_in: null, freq_cv_in: null, q_cv_in: null };
    const params = { frequency: 1000, q: 1, gain: 0, type: 'lowpass' };
    const resultState = context.TestedLogic(inputs, params, {});
    const outputs = context.getOutputs();
    expect(Object.keys(outputs).length).toBe(0); // NATIVE_LOGIC_CODE_PLACEHOLDER does not call setOutput.
    expect(resultState).toEqual({});
  });
});
  `.trim(),
};
