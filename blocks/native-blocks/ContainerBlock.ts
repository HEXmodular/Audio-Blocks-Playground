import { BlockDefinition } from '@interfaces/block';
import { Gain, ToneAudioNode } from 'tone';

export const BLOCK_DEFINITION: BlockDefinition = {
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

export class ContainerBlock extends ToneAudioNode {
  readonly name: string = BLOCK_DEFINITION.name;
  readonly input: ToneAudioNode;
  readonly output: ToneAudioNode;

  constructor() {
    super();
    this.input = new Gain();
    this.output = new Gain();
  }

  public static getDefinition(): BlockDefinition {
    return BLOCK_DEFINITION;
  }
}
