
import { BlockDefinition } from '../types';
import { createParameterDefinitions, NATIVE_LOGIC_CODE_PLACEHOLDER } from '../constants';

export const NATIVE_ALLPASS_FILTER_BLOCK_DEFINITION: BlockDefinition = {
  id: 'native-allpass-filter-v1',
  name: 'Allpass Filter (Native)',
  description: 'A native allpass filter. Implements y[n] = -g*x[n] + x[n-M] + g*y[n-M] using DelayNodes and GainNodes.',
  runsAtAudioRate: true,
  inputs: [
    { id: 'audio_in', name: 'Audio Input', type: 'audio', description: 'Signal to process.' },
    { id: 'delay_cv_in', name: 'Delay CV', type: 'audio', description: 'Modulates the delay time of the main input delay path.', audioParamTarget: 'delayTime' },
    { id: 'coeff_cv_in', name: 'Coeff CV', type: 'audio', description: 'Modulates the \'g\' coefficient of the feedback path.', audioParamTarget: 'coefficient' }
  ],
  outputs: [
    { id: 'audio_out', name: 'Audio Output', type: 'audio', description: 'Processed audio signal.' }
  ],
  parameters: createParameterDefinitions([
    { id: 'delayTime', name: 'Delay Time (s)', type: 'slider', min: 0.0001, max: 1.0, step: 0.0001, defaultValue: 0.05, description: 'Delay length M in seconds. Affects both input and feedback delay paths.' },
    { id: 'coefficient', name: 'Coefficient (g)', type: 'slider', min: -0.99, max: 0.99, step: 0.01, defaultValue: 0.5, description: 'Feedback/feedforward coefficient g.' }
  ]),
  logicCode: NATIVE_LOGIC_CODE_PLACEHOLDER,
  initialPrompt: 'Create a native allpass filter using DelayNodes and GainNodes to implement the structure y[n] = -g*x[n] + x[n-M] + g*y[n-M]. Parameters: delayTime (M), coefficient (g). Add CV inputs for delayTime (targeting the input delay path) and coefficient (targeting the feedback gain).',
};
