import { Split } from 'tone';
import { NativeBlock, BlockDefinition, BlockInstance } from '@interfaces/block';

const BLOCK_DEFINITION: BlockDefinition = {
  id: 'tone-split-v1',
  name: 'Split',
  description: 'Splits a stereo audio signal into two separate mono signals (left and R Channels).',
  category: 'i/o',
  inputs: [
    { id: 'audio_in', name: 'Audio', type: 'audio', description: 'The stereo audio signal to split.' }
  ],
  outputs: [
    { id: 'left', name: 'Left', type: 'audio', description: 'The L Channel of the audio signal.' },
    { id: 'right', name: 'Right', type: 'audio', description: 'The R Channel of the audio signal.' }
  ],
  parameters: [],
};

// TODO протестировать
export class SplitBlock extends Split implements NativeBlock {
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