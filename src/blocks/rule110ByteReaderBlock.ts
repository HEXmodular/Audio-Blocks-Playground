
import { BlockDefinition } from '../types';
import { createParameterDefinitions } from '../constants';

export const RULE_110_BYTE_READER_BLOCK_DEFINITION: BlockDefinition = {
  id: 'rule-110-byte-reader-v1',
  name: 'Rule 110 Byte Reader',
  description: 'Reads a specific bit from incoming Rule 110 numeric states over N triggers, then outputs the collected byte (as number) and the chosen bit\'s last state.',
  inputs: [
    { id: 'numeric_state_in', name: 'Numeric State In', type: 'number', description: 'Input from a Rule 110 source.'},
    { id: 'trigger_in', name: 'Trigger', type: 'trigger', description: 'Reads one bit on trigger.'}
  ],
  outputs: [
    { id: 'byte_out', name: 'Byte Out', type: 'number', description: 'Collected byte (8 bits) as a number, MSB first. Outputs when N bits are collected.'},
    { id: 'selected_bit_out', name: 'Selected Bit Out', type: 'boolean', description: 'State of the chosen bit from the last read numeric state.'}
  ],
  parameters: createParameterDefinitions([
    { id: 'rule110_core_length', name: 'Input Core Length', type: 'slider', min:1, max:16, step:1, defaultValue:8, description: 'Core length of the Rule 110 source this block reads from.'},
    { id: 'bit_to_read', name: 'Bit to Read (0-indexed from MSB)', type: 'slider', min:0, max:15, step:1, defaultValue:0, description: 'Which bit of the input state to sample (0 is MSB).'},
    { id: 'bits_to_collect_N', name: 'Bits to Collect (N)', type: 'slider', min:1, max:8, step:1, defaultValue:8, description: 'Number of bits to collect before outputting byte_out.'}
  ]),
  logicCode: `
const coreLength = params.rule110_core_length;
const bitToRead = Math.min(params.bit_to_read, coreLength - 1); // Ensure bit_to_read is within coreLength
const N = params.bits_to_collect_N;

const numericStateIn = inputs.numeric_state_in;
const trigger = inputs.trigger_in;

let collectedBits = internalState.collectedBits || 0;
let bitCount = internalState.bitCount || 0;
let lastSelectedBitState = internalState.lastSelectedBitState || false;

if (trigger === true && (internalState.prevTriggerState === false || internalState.prevTriggerState === undefined)) {
  if (numericStateIn !== null && typeof numericStateIn === 'number' && isFinite(numericStateIn)) {
    // Extract the specified bit (0-indexed from MSB)
    // (numericStateIn >> (coreLength - 1 - bitToRead)) & 1
    const selectedBit = ( (Math.floor(numericStateIn) >> (coreLength - 1 - bitToRead)) & 1 ) === 1;
    lastSelectedBitState = selectedBit;
    
    collectedBits = (collectedBits << 1) | (selectedBit ? 1 : 0);
    bitCount++;
    
    // __custom_block_logger__(\`Read bit \${bitToRead} as \${selectedBit}. Collected: \${collectedBits.toString(2).padStart(bitCount,'0')}, Count: \${bitCount}/\${N}\`);

    if (bitCount >= N) {
      setOutput('byte_out', collectedBits & ((1 << N) -1) ); // Output last N bits
      // __custom_block_logger__(\`Byte output: \${collectedBits & ((1 << N) -1)} after \${N} bits.\`);
      collectedBits = 0; // Reset for next byte
      bitCount = 0;
    } else {
      setOutput('byte_out', null); // No full byte yet
    }
  }
}
setOutput('selected_bit_out', lastSelectedBitState);

internalState.collectedBits = collectedBits;
internalState.bitCount = bitCount;
internalState.lastSelectedBitState = lastSelectedBitState;
internalState.prevTriggerState = trigger;

return internalState;
  `.trim(),
  initialPrompt: 'Create a Rule 110 Byte Reader. Parameters: "Input Core Length" (slider 1-16), "Bit to Read (0-indexed from MSB)" (slider 0-15), "Bits to Collect (N)" (slider 1-8 for byte). Inputs: "Numeric State In", "Trigger". Outputs: "Byte Out" (number, after N bits), "Selected Bit Out" (boolean). Logic samples the chosen bit from input on trigger, accumulates N bits, then outputs byte.',
};
