import { MidSideMerge } from 'tone';
import { NativeBlock, BlockDefinition, BlockInstance } from '@interfaces/block';

const BLOCK_DEFINITION: BlockDefinition = {
  id: 'tone-mid-side-merge-v1',
  name: 'Mid Side Merge',
  description: 'Merges two mono audio signals into a mid side signal.',
  category: 'i/o',
  inputs: [
    { id: 'mid', name: 'Mid Channel', type: 'audio', description: 'The mid channel of the audio signal.' },
    { id: 'side', name: 'Side Channel', type: 'audio', description: 'The side channel of the audio signal.' }
  ],
  outputs: [
    { id: 'audio_out', name: 'Audio Out', type: 'audio', description: 'The mid side audio signal.' },
  ],
  parameters: [],
};

// TODO протестировать
export class MidSideMergeBlock extends MidSideMerge implements NativeBlock {
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