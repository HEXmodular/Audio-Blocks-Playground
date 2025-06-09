
import { BlockDefinition } from '../types';
import { createParameterDefinitions, NATIVE_LOGIC_CODE_PLACEHOLDER } from '../constants';

export const OSCILLOSCOPE_BLOCK_DEFINITION: BlockDefinition = {
  id: 'analyser-oscilloscope-v1',
  name: 'Oscilloscope (Analyser)',
  description: 'Visualizes an audio signal waveform using a native AnalyserNode. The UI is shown in the block detail panel.',
  runsAtAudioRate: true, // It processes audio via the AnalyserNode
  inputs: [
    { id: 'audio_in', name: 'Audio Input', type: 'audio', description: 'Signal to visualize.' }
  ],
  outputs: [], // No audio output
  parameters: createParameterDefinitions([
    {
      id: 'fftSize',
      name: 'FFT Size',
      type: 'select',
      options: [
        { value: 32, label: '32' }, { value: 64, label: '64' }, { value: 128, label: '128' },
        { value: 256, label: '256' }, { value: 512, label: '512' }, { value: 1024, label: '1024' },
        { value: 2048, label: '2048' }, { value: 4096, label: '4096' }, { value: 8192, label: '8192' },
        { value: 16384, label: '16384' }, { value: 32768, label: '32768' }
      ],
      defaultValue: 2048,
      description: 'Size of the FFT window. This influences the detail in the time domain data for the oscilloscope.'
    }
  ]),
  logicCode: NATIVE_LOGIC_CODE_PLACEHOLDER,
  initialPrompt: 'Create an oscilloscope block using a native Web Audio AnalyserNode. It should take one audio input. It will have one parameter "fftSize" (select type, with power-of-2 options from 32 to 32768, default 2048) to control the AnalyserNode.fftSize property. The UI display for this block will be handled by a custom component in the detail panel.',
};
