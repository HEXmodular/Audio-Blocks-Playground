
import { BlockDefinition } from '../types';
import { createParameterDefinitions, NATIVE_LOGIC_CODE_PLACEHOLDER } from '../constants';

export const NATIVE_DELAY_BLOCK_DEFINITION: BlockDefinition = {
  id: 'native-delay-v1',
  name: 'Delay (Native)',
  description: 'A standard Web Audio API DelayNode. Audio path is managed by Web Audio graph connections.',
  runsAtAudioRate: true,
  inputs: [
    { id: 'audio_in', name: 'Audio Input', type: 'audio', description: 'Connects to native DelayNode input in Web Audio graph.' },
    { id: 'delay_cv_in', name: 'Delay CV', type: 'audio', description: 'Modulates delayTime AudioParam directly in Web Audio graph.', audioParamTarget: 'delayTime'}
  ],
  outputs: [
    { id: 'audio_out', name: 'Audio Output', type: 'audio', description: 'Output from native DelayNode in Web Audio graph.' }
  ],
  parameters: createParameterDefinitions([ 
    { id: 'delayTime', name: 'Delay Time (s)', type: 'slider', min: 0, max: 5, step: 0.001, defaultValue: 0.5, description: 'Delay in seconds (AudioParam). Max effective delay fixed at node creation (e.g. 5s by default in engine).' },
  ]),
  logicCode: NATIVE_LOGIC_CODE_PLACEHOLDER,
  initialPrompt: 'Standard Web Audio API DelayNode with a delayTime parameter. It should accept audio input for the main signal and CV for delayTime modulation.',
};
