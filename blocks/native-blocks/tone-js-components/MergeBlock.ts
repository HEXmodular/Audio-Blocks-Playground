import { Merge } from 'tone';
import { NativeBlock, BlockDefinition, BlockInstance } from '@interfaces/block';

const BLOCK_DEFINITION: BlockDefinition = {
  id: 'tone-merge-v1',
  name: 'Merge',
  description: 'Merges two mono audio signals into a stereo signal.',
  category: 'i/o',
  inputs: [
    { id: 'left', name: 'Left Channel', type: 'audio', description: 'The left channel of the audio signal.' },
    { id: 'right', name: 'Right Channel', type: 'audio', description: 'The right channel of the audio signal.' }
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