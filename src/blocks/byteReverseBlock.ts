
import { BlockDefinition } from '../types';
import { createParameterDefinitions } from '../constants';

export const BYTE_REVERSE_BLOCK_DEFINITION: BlockDefinition = {
  id: 'byte-reverse-v1',
  name: 'Byte Reverse',
  description: 'Reverses the order of N bits in an incoming number.',
  inputs: [
    { id: 'number_in', name: 'Number In', type: 'number', description: 'Integer number to process.'}
  ],
  outputs: [
    { id: 'reversed_number_out', name: 'Reversed Number Out', type: 'number', description: 'Number with N LSBs reversed.'}
  ],
  parameters: createParameterDefinitions([
    { id: 'num_bits_N', name: 'Number of Bits (N)', type: 'slider', min:1, max:16, step:1, defaultValue:8, description: 'Number of LSBs to consider for reversal.'}
  ]),
  logicCode: `
const numberIn = inputs.number_in;
const N = params.num_bits_N;
let reversedNum = 0;

if (numberIn !== null && typeof numberIn === 'number' && isFinite(numberIn)) {
  const val = Math.floor(Math.abs(numberIn)); // Use positive integer part
  for (let i = 0; i < N; i++) {
    if ((val >> i) & 1) { // Check i-th LSB of input
      reversedNum |= (1 << (N - 1 - i)); // Set (N-1-i)-th LSB of output
    }
  }
  // __custom_block_logger__(\`Reversed \${val} (N=\${N}) to \${reversedNum}\`);
  setOutput('reversed_number_out', reversedNum);
} else {
  setOutput('reversed_number_out', 0); // Default if no valid input
}
return {};
  `.trim(),
  initialPrompt: 'Create a Byte Reverse block. Parameter: "Number of Bits (N)" (slider 1-16, default 8). Input: "Number In". Output: "Reversed Number Out". Logic reverses the order of the N least significant bits of the input number.',
};
