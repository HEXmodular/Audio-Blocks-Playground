
import { BlockDefinition } from '../types';
import { createParameterDefinitions } from '../constants';

export const GAIN_BLOCK_DEFINITION: BlockDefinition = {
  id: 'gain-v1',
  name: 'Gain Control (Native)',
  description: 'Wraps a native Web Audio API GainNode. Amplifies or attenuates an audio signal. Its "gain" parameter controls the GainNode.gain AudioParam. Audio path is managed by Web Audio graph connections.',
  runsAtAudioRate: true,
  inputs: [
    { id: 'audio_in', name: 'Audio Input', type: 'audio', description: 'Signal to process (connects to native GainNode input in Web Audio graph)' },
    { id: 'gain_cv_in', name: 'Gain CV', type: 'audio', description: 'Modulates gain AudioParam directly in Web Audio graph.', audioParamTarget: 'gain' }
  ],
  outputs: [
    { id: 'audio_out', name: 'Audio Output', type: 'audio', description: 'Processed audio signal (from native GainNode output in Web Audio graph)' }
  ],
  parameters: createParameterDefinitions([ 
    { id: 'gain', name: 'Gain Factor', type: 'slider', min: 0, max: 2, step: 0.01, defaultValue: 1, description: 'Gain multiplier (AudioParam for native GainNode)' }
  ]),
  logicCode: `
// This block wraps a native GainNode. Its 'gain' parameter is an AudioParam, updated by the host.
// 'audio_in', 'audio_out', 'gain_cv_in' represent connections in the Web Audio graph.
// This logicCode does not process audio or directly manage AudioParams.
// Any main-thread logic specific to this block (e.g., reacting to non-audio inputs/params) would go here.
// Currently, it's a simple pass-through for control logic, as the host handles native node parameter updates.
// __custom_block_logger__('Native Gain Block: Main-thread tick. Parameters are for the native GainNode managed by the host.');
return {};
  `.trim(),
  initialPrompt: 'Create a gain control block that wraps a native Web Audio API GainNode. It should take an audio input and a gain CV input (for direct AudioParam modulation). It should have a "gain" parameter (slider from 0 to 2) that controls the native GainNode\'s gain AudioParam. It should output the processed audio signal.',
};
