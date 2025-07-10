import { BlockDefinition, BlockPort } from '@interfaces/block';

export const ContainerBlock: BlockDefinition = {
  id: 'ContainerBlock',
  name: 'Container',
  description: 'A block that can contain other blocks.',
  category: 'container',
  inputs: [
    { id: 'audioIn', name: 'Audio In', type: 'audio' },
    { id: 'dataIn', name: 'Data In', type: 'any' },
  ],
  outputs: [
    { id: 'audioOut', name: 'Audio Out', type: 'audio' },
    { id: 'dataOut', name: 'Data Out', type: 'any' },
  ],
  parameters: [],
};
