import { MidSideSplit } from 'tone';
import { NativeBlock, BlockDefinition, BlockInstance } from '@interfaces/block';

const BLOCK_DEFINITION: BlockDefinition = {
  id: 'tone-mid-side-split-v1',
  name: 'Mid Side Split',
  description: 'Splits a stereo audio signal into two separate mono signals (mid and side channels).',
  category: 'i/o',
  inputs: [
    { id: 'audio_in', name: 'Audio Input', type: 'audio', description: 'The stereo audio signal to split.' }
  ],
  outputs: [
    { id: 'mid', name: 'Mid Channel', type: 'audio', description: 'The mid channel of the audio signal.' },
    { id: 'side', name: 'Side Channel', type: 'audio', description: 'The side channel of the audio signal.' }
  ],
  parameters: [],
};

// TODO протестировать
export class MidSideSplitBlock extends MidSideSplit implements NativeBlock {
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