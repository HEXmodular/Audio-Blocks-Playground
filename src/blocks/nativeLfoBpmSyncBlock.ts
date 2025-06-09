
import { BlockDefinition } from '../types';
import { createParameterDefinitions, NATIVE_LOGIC_CODE_PLACEHOLDER, BPM_FRACTIONS } from '../constants';

export const NATIVE_LFO_BPM_SYNC_BLOCK_DEFINITION: BlockDefinition = {
  id: 'native-lfo-bpm-sync-v1',
  name: 'LFO (BPM Sync)',
  description: 'LFO synchronized to global BPM, using a native OscillatorNode. Frequency is derived from BPM and selected fraction.',
  runsAtAudioRate: true,
  inputs: [
    // No direct frequency CV, as it's BPM derived. Could add CV for fraction selection if complex.
  ],
  outputs: [
    { id: 'audio_out', name: 'LFO Output', type: 'audio', description: 'The BPM-synced LFO signal.' }
  ],
  parameters: createParameterDefinitions([
    { id: 'bpm_fraction', name: 'BPM Fraction', type: 'select', options: BPM_FRACTIONS, defaultValue: 1, description: 'LFO rate as a fraction of the global BPM.' },
    { id: 'waveform', name: 'Waveform', type: 'select', options: [{value: 'sine', label: 'Sine'}, {value: 'square', label: 'Square'}, {value: 'sawtooth', label: 'Sawtooth'}, {value: 'triangle', label: 'Triangle'}], defaultValue: 'sine', description: 'LFO waveform shape.' },
    { id: 'gain', name: 'Amplitude', type: 'slider', min: 0, max: 10, step: 0.1, defaultValue: 1, description: 'Amplitude of the LFO signal (controls internal GainNode).' }
  ]),
  logicCode: NATIVE_LOGIC_CODE_PLACEHOLDER, // Host will calculate frequency from BPM & fraction and set on OscillatorNode
  initialPrompt: 'Create a native LFO block synchronized to global BPM. It should use an OscillatorNode. Parameters: bpm_fraction (select from common musical divisions like 1/4, 1/8, 1/16, triplets, dotted), waveform, amplitude. Output: LFO audio signal. The host audio engine will calculate the actual frequency based on global BPM and the selected fraction.',
};
