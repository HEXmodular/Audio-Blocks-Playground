
import { BlockDefinition } from '../types';
import { createParameterDefinitions } from '../constants';

export const NATIVE_AR_ENVELOPE_BLOCK_DEFINITION: BlockDefinition = {
  id: 'native-ar-envelope-v1',
  name: 'AR Envelope (Native)',
  description: 'Attack-Release envelope generator using a native ConstantSourceNode and AudioParam automation. Controlled by a gate input.',
  runsAtAudioRate: true,
  inputs: [
    { id: 'gate_in', name: 'Gate', type: 'gate', description: 'Controls the envelope state (high for attack/sustain, low for release).' }
  ],
  outputs: [
    { id: 'audio_out', name: 'Envelope Output', type: 'audio', description: 'The envelope signal (0 to Sustain Level).' }
  ],
  parameters: createParameterDefinitions([
    { id: 'attackTime', name: 'Attack Time (s)', type: 'slider', min: 0.001, max: 5, step: 0.001, defaultValue: 0.1, description: 'Envelope attack time in seconds.' },
    { id: 'releaseTime', name: 'Release Time (s)', type: 'slider', min: 0.001, max: 5, step: 0.001, defaultValue: 0.5, description: 'Envelope release time in seconds.' },
    { id: 'sustainLevel', name: 'Sustain Level', type: 'slider', min: 0, max: 10, step: 0.1, defaultValue: 0.7, description: 'Sustain level of the envelope (when gate is high).' }
  ]),
  logicCode: `
// This logic code detects changes in 'gate_in' and sets flags for the host audio engine.
// The actual envelope generation is handled by useAudioEngine.

const gateInputVal = !!inputs.gate_in; // Ensure boolean
let newInternalState = { ...internalState };

// Detect rising edge (gate becomes true)
if (gateInputVal === true && (internalState.prevGateState === false || internalState.prevGateState === undefined)) {
  newInternalState.gateStateChangedToHigh = true;
  newInternalState.gateStateChangedToLow = false; // Ensure only one state change per tick
  __custom_block_logger__('AR Envelope gate became HIGH. Setting gateStateChangedToHigh.');
}
// Detect falling edge (gate becomes false)
else if (gateInputVal === false && internalState.prevGateState === true) {
  newInternalState.gateStateChangedToLow = true;
  newInternalState.gateStateChangedToHigh = false; // Ensure only one state change per tick
  __custom_block_logger__('AR Envelope gate became LOW. Setting gateStateChangedToLow.');
} else {
  // No change, or consecutive same states, clear flags
  newInternalState.gateStateChangedToHigh = false;
  newInternalState.gateStateChangedToLow = false;
}

newInternalState.prevGateState = gateInputVal;

return newInternalState;
  `.trim(),
  initialPrompt: 'Create a native AR (Attack-Release) envelope generator. It should use a ConstantSourceNode and AudioParam automation. Parameters: attackTime (s), releaseTime (s), sustainLevel. Input: gate_in (boolean type, high for attack/sustain, low for release). Output: envelope audio signal. The main-thread logicCode should detect gate changes and inform the host audio engine.',
};
