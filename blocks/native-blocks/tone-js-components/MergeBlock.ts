import { Merge } from 'tone';
import { NativeBlock, BlockDefinition, BlockInstance } from '@interfaces/block';

const BLOCK_DEFINITION: BlockDefinition = {
  id: 'tone-merge-v1',
  name: 'Merge',
  description: 'Merges two mono audio signals into a stereo signal.',
  category: 'i/o',
  inputs: [
    { id: 'left', name: 'L Channel', type: 'audio', description: 'The L Channel of the audio signal.' },
    { id: 'right', name: 'R Channel', type: 'audio', description: 'The R Channel of the audio signal.' }
  ],
  outputs: [
    { id: 'audio_out', name: 'Audio Out', type: 'audio', description: 'The stereo audio signal.' },
  ],
  parameters: [],
};

// TODO протестировать
export class MergeBlock extends Merge implements NativeBlock {
  readonly name: string = BLOCK_DEFINITION.name;

  constructor() {
    super();
  }

  public static getDefinition(): BlockDefinition {
    return BLOCK_DEFINITION;
  }

  public updateFromBlockInstance(instance: BlockInstance): void {
    // No parameters to update for Tone.Split
  }
}