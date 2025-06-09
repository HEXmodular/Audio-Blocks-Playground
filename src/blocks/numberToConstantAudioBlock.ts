
import { BlockDefinition } from '../types';
import { createParameterDefinitions } from '../constants';

export const NUMBER_TO_CONSTANT_AUDIO_BLOCK_DEFINITION: BlockDefinition = {
  id: 'number-to-constant-audio-v1',
  name: 'Number to Constant Audio',
  description: 'Converts a number input to a constant audio signal via ConstantSourceNode, with gain control.',
  runsAtAudioRate: true,
  inputs: [
    { id: 'number_in', name: 'Number In', type: 'number', description: 'Numeric value to output as constant audio.' }
  ],
  outputs: [
    { id: 'audio_out', name: 'Audio Output', type: 'audio', description: 'Constant audio signal.' }
  ],
  parameters: createParameterDefinitions([
    { id: 'gain', name: 'Gain', type: 'slider', min: 0, max: 1, step: 0.01, defaultValue: 1, description: 'Gain applied to the constant audio signal.' },
    { id: 'max_input_value', name: 'Max Expected Input', type: 'number_input', min: 1, defaultValue: 255, description: 'Expected maximum of number_in, for normalization to -1 to 1 range before gain.'}
  ]),
  logicCode: `
// Main thread logic for Number to Constant Audio.
// The 'number_in' value will be read by useAudioEngine and used to set the ConstantSourceNode's offset.
// The 'gain' parameter is also handled by useAudioEngine for an internal GainNode.
// The 'max_input_value' param helps useAudioEngine normalize the number_in to an audio range like -1 to 1.

// This logic code is a placeholder as primary functionality is in the audio engine.
// It can be used for logging or reacting to non-audio related changes if any.
// For example, if number_in was intended to set a state variable that then gets read by worklet.
// But for ConstantSourceNode, the engine directly uses inputs.number_in.

const numIn = inputs.number_in;
// __custom_block_logger__(\`Number input received: \${numIn}. Audio engine handles ConstantSourceNode.\`);

// No outputs from logic code itself, audio is from native node.
return {};
  `.trim(),
  initialPrompt: 'Create a block that converts a number input to a constant audio signal. Use a native ConstantSourceNode. Parameters: "Gain" (slider 0-1) for an internal GainNode, "Max Expected Input" (number_input, e.g., 255 for 8-bit numbers) to normalize the input number to audio range (-1 to 1) before applying gain. Input: "Number In". Output: "Audio Output". The audio engine will manage the ConstantSourceNode and GainNode.',
};
