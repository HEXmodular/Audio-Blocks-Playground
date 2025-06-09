
import { BlockDefinition } from '../types';
import { createParameterDefinitions } from '../constants';

export const NATIVE_AD_ENVELOPE_BLOCK_DEFINITION: BlockDefinition = {
  id: 'native-ad-envelope-v1',
  name: 'AD Envelope (Native)',
  description: 'Attack-Decay envelope generator using a native ConstantSourceNode and AudioParam automation. Triggered by input signal.',
  runsAtAudioRate: true,
  inputs: [
    { id: 'trigger_in', name: 'Trigger', type: 'trigger', description: 'Triggers the envelope.' }
  ],
  outputs: [
    { id: 'audio_out', name: 'Envelope Output', type: 'audio', description: 'The envelope signal (0 to Peak Level).' }
  ],
  parameters: createParameterDefinitions([
    { id: 'attackTime', name: 'Attack Time (s)', type: 'slider', min: 0.001, max: 5, step: 0.001, defaultValue: 0.1, description: 'Envelope attack time in seconds.' },
    { id: 'decayTime', name: 'Decay Time (s)', type: 'slider', min: 0.001, max: 5, step: 0.001, defaultValue: 0.3, description: 'Envelope decay time in seconds.' },
    { id: 'peakLevel', name: 'Peak Level', type: 'slider', min: 0, max: 10, step: 0.1, defaultValue: 1, description: 'Peak level of the envelope.' }
  ]),
  logicCode: `
// This logic code detects a rising edge on 'trigger_in' and manages envelopeNeedsTriggering.
// The actual envelope generation is handled by useAudioEngine using ConstantSourceNode and AudioParam ramps.

const triggerInputVal = inputs.trigger_in;
let newInternalState = { ...internalState }; // Make a mutable copy

if (triggerInputVal === true && (internalState.prevTriggerState === false || internalState.prevTriggerState === undefined || internalState.prevTriggerState === null)) {
  newInternalState.envelopeNeedsTriggering = true;
  __custom_block_logger__('AD Envelope trigger detected. Setting envelopeNeedsTriggering to true.');
}

newInternalState.prevTriggerState = triggerInputVal;

return newInternalState;
  `.trim(),
  initialPrompt: 'Create a native AD (Attack-Decay) envelope generator. It should use a ConstantSourceNode and AudioParam automation (linearRampToValueAtTime). Parameters: attackTime (s), decayTime (s), peakLevel. Input: trigger_in. Output: envelope audio signal. The main-thread logicCode should detect the trigger and inform the host audio engine to start the ramps.',
};
