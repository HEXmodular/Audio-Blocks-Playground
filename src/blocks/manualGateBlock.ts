
import { BlockDefinition } from '../types';
import { createParameterDefinitions } from '../constants';

export const MANUAL_GATE_BLOCK_DEFINITION: BlockDefinition = {
  id: 'manual-gate-v1',
  name: 'Manual Gate',
  description: 'Provides a manual gate signal via a toggle UI parameter.',
  inputs: [],
  outputs: [
    { id: 'gate_out', name: 'Gate Output', type: 'gate', description: 'Boolean gate signal.' }
  ],
  parameters: createParameterDefinitions([
    { id: 'gate_active', name: 'Gate Active', type: 'toggle', defaultValue: false, description: 'Controls the state of the gate output.' }
  ]),
  logicCode: `
// Outputs the state of the 'gate_active' parameter.
const gateState = params.gate_active;
setOutput('gate_out', gateState);
// __custom_block_logger__(\`Manual Gate output: \${gateState}\`);
return {};
  `.trim(),
  initialPrompt: 'Create a Manual Gate block. It should have one toggle parameter "Gate Active" and one output port "Gate Output" of type gate. The output should reflect the state of the toggle.',
};
