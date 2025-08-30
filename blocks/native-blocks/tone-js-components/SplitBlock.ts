import { Split } from 'tone';
import { NativeBlock, BlockDefinition, BlockInstance } from '@interfaces/block';

const BLOCK_DEFINITION: BlockDefinition = {
  id: 'tone-split-v1',
  name: 'Split',
  description: 'Splits a stereo audio signal into two separate mono signals (left and right channels).',
  category: 'i/o',
  inputs: [
    { id: 'audio_in', name: 'Audio Input', type: 'audio', description: 'The stereo audio signal to split.' }
  ],
  outputs: [
    { id: 'left', name: 'Left Channel', type: 'audio', description: 'The left channel of the audio signal.' },
    { id: 'right', name: 'Right Channel', type: 'audio', description: 'The right channel of the audio signal.' }
  ],
  parameters: [],
};

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