
import { BlockDefinition } from '../types';
import { createParameterDefinitions } from '../constants';

export const RULE_110_JOIN_BLOCK_DEFINITION: BlockDefinition = {
  id: 'rule-110-join-v1',
  name: 'Rule 110 Join',
  description: 'Joins two numeric states for a Rule 110 automaton, computes next step, splits, and outputs.',
  inputs: [
    { id: 'numeric_state_in_1', name: 'Numeric State In 1', type: 'number', description: 'First part of the automaton state.' },
    { id: 'numeric_state_in_2', name: 'Numeric State In 2', type: 'number', description: 'Second part of the automaton state.' },
    { id: 'trigger_in', name: 'Trigger', type: 'trigger', description: 'Advances automaton one step.' }
  ],
  outputs: [
    { id: 'numeric_state_out_1', name: 'Numeric State Out 1', type: 'number', description: 'First part of the next state.' },
    { id: 'numeric_state_out_2', name: 'Numeric State Out 2', type: 'number', description: 'Second part of the next state.' }
  ],
  parameters: createParameterDefinitions([
    { id: 'core_length_1', name: 'Core Length 1 (N1)', type: 'slider', min: 1, max: 8, step: 1, defaultValue: 4, description: 'Number of bits for state 1.' },
    { id: 'core_length_2', name: 'Core Length 2 (N2)', type: 'slider', min: 1, max: 8, step: 1, defaultValue: 4, description: 'Number of bits for state 2.' },
    { id: 'boundary_bits_handling', name: 'Boundary Bits', type: 'select', options: [{value:'zero', label:'Zeros'}, {value:'one', label:'Ones'}, {value:'wrap', label:'Wrap Around'}], defaultValue: 'zero', description: 'How to handle boundary bits for the combined automaton.'}
  ]),
  logicCode: `
const N1 = Math.max(1, Math.min(8, params.core_length_1));
const N2 = Math.max(1, Math.min(8, params.core_length_2));
const totalCoreLength = N1 + N2;

const stateIn1 = inputs.numeric_state_in_1;
const stateIn2 = inputs.numeric_state_in_2;
const trigger = inputs.trigger_in;

const RULE_110_MAP = [0,1,1,1,0,1,1,0];

function applyRule110(left, middle, right) {
  const index = (left ? 4 : 0) + (middle ? 2 : 0) + (right ? 1 : 0);
  return RULE_110_MAP[index] === 1;
}

// Initialize pattern if not present or if lengths changed
if (!internalState.currentPattern || internalState.N1 !== N1 || internalState.N2 !== N2) {
  internalState.currentPattern = new Array(totalCoreLength + 2).fill(false); // +2 for L/R boundaries
  internalState.N1 = N1;
  internalState.N2 = N2;
   __custom_block_logger__(\`Pattern re-initialized for N1=\${N1}, N2=\${N2}\`);
}
let currentPattern = internalState.currentPattern;

// Apply inputs to pattern if available
if (stateIn1 !== null && typeof stateIn1 === 'number') {
  const maxVal1 = (1 << N1) - 1;
  const intVal1 = Math.max(0, Math.min(maxVal1, Math.floor(stateIn1)));
  for (let i = 0; i < N1; i++) {
    currentPattern[i + 1] = (intVal1 & (1 << (N1 - 1 - i))) !== 0; // Bit 0 of stateIn1 is MSB of N1 part
  }
}
if (stateIn2 !== null && typeof stateIn2 === 'number') {
  const maxVal2 = (1 << N2) - 1;
  const intVal2 = Math.max(0, Math.min(maxVal2, Math.floor(stateIn2)));
  for (let i = 0; i < N2; i++) {
    currentPattern[N1 + i + 1] = (intVal2 & (1 << (N2 - 1 - i))) !== 0; // Bit 0 of stateIn2 is MSB of N2 part
  }
}

if (trigger === true && (internalState.prevTriggerState === false || internalState.prevTriggerState === undefined)) {
  const boundaryMode = params.boundary_bits_handling;
  // Set boundary bits before stepping
  if (boundaryMode === 'zero') {
    currentPattern[0] = false; // Left boundary
    currentPattern[totalCoreLength + 1] = false; // Right boundary
  } else if (boundaryMode === 'one') {
    currentPattern[0] = true;
    currentPattern[totalCoreLength + 1] = true;
  } else { // wrap
    currentPattern[0] = currentPattern[totalCoreLength]; // L-bnd = last core cell of combined
    currentPattern[totalCoreLength + 1] = currentPattern[1]; // R-bnd = first core cell of combined
  }
  
  const nextPattern = [...currentPattern];
  for (let i = 0; i < totalCoreLength; ++i) { // Iterate all core cells (N1+N2)
    const leftNeighbor = currentPattern[i];
    const currentCell  = currentPattern[i + 1];
    const rightNeighbor= currentPattern[i + 2];
    nextPattern[i + 1] = applyRule110(leftNeighbor, currentCell, rightNeighbor);
  }
  currentPattern = nextPattern;
  internalState.currentPattern = currentPattern;

  let numericOutput1 = 0;
  for (let i = 0; i < N1; ++i) {
    if (currentPattern[i + 1]) {
      numericOutput1 |= (1 << (N1 - 1 - i));
    }
  }
  setOutput('numeric_state_out_1', numericOutput1);

  let numericOutput2 = 0;
  for (let i = 0; i < N2; ++i) {
    if (currentPattern[N1 + i + 1]) {
      numericOutput2 |= (1 << (N2 - 1 - i));
    }
  }
  setOutput('numeric_state_out_2', numericOutput2);
  // __custom_block_logger__(\`Join: Stepped. Out1: \${numericOutput1}, Out2: \${numericOutput2}\`);
}
internalState.prevTriggerState = trigger;

return internalState;
  `.trim(),
  initialPrompt: 'Create a Rule 110 Join block. Parameters: "Core Length 1 (N1)" (slider 1-8), "Core Length 2 (N2)" (slider 1-8), "Boundary Bits" (select: Zeros, Ones, Wrap). Inputs: "Numeric State In 1", "Numeric State In 2", "Trigger". Outputs: "Numeric State Out 1", "Numeric State Out 2". Logic combines N1 and N2 bits, applies Rule 110 with chosen boundaries, then splits the result.',
};
