import { NativeBlock } from './NativeBlock';
import type { BlockDefinition, BlockParameter } from '../../types';
import { createParameterDefinitions } from '../../constants';
import type { ManagedNativeNodeInfo } from '../NativeNodeManager';

export class LFONativeBlock extends NativeBlock {
  constructor(audioContext: AudioContext | null) {
    super(audioContext);
  }

  createNode(instanceId: string, initialParams: BlockParameter[]): ManagedNativeNodeInfo {
    if (!this.audioContext) {
      throw new Error("AudioContext not initialized in LFONativeBlock.");
    }

    const oscillatorNode = this.audioContext.createOscillator();
    const amplitudeGainNode = this.audioContext.createGain();

    // Connect oscillator to gain node, and gain node will be the output
    oscillatorNode.connect(amplitudeGainNode);

    // Get default values from definition
    const freqParamDef = LFO_BLOCK_DEFINITION.parameters.find(p => p.id === 'frequency');
    const waveParamDef = LFO_BLOCK_DEFINITION.parameters.find(p => p.id === 'waveform');
    const ampParamDef = LFO_BLOCK_DEFINITION.parameters.find(p => p.id === 'amplitude');

    // Apply initial parameters
    const initialFrequency = initialParams.find(p => p.id === 'frequency')?.currentValue as number ?? freqParamDef?.defaultValue as number ?? 1;
    const initialWaveform = initialParams.find(p => p.id === 'waveform')?.currentValue as OscillatorType ?? waveParamDef?.defaultValue as OscillatorType ?? 'sine';
    const initialAmplitude = initialParams.find(p => p.id === 'amplitude')?.currentValue as number ?? ampParamDef?.defaultValue as number ?? 1;

    oscillatorNode.frequency.setValueAtTime(initialFrequency, this.audioContext.currentTime);
    oscillatorNode.type = initialWaveform;
    amplitudeGainNode.gain.setValueAtTime(initialAmplitude, this.audioContext.currentTime);

    oscillatorNode.start();

    const paramTargetsForCv = new Map<string, AudioParam>();
    paramTargetsForCv.set('frequency', oscillatorNode.frequency);
    paramTargetsForCv.set('amplitude', amplitudeGainNode.gain);
    // Waveform 'type' is not an AudioParam, so it cannot be directly modulated by an audio signal here.

    return {
      nodeForInputConnections: amplitudeGainNode, // Nothing connects directly to LFO input in this design yet
      nodeForOutputConnections: amplitudeGainNode, // Output is the gain-controlled oscillator
      mainProcessingNode: oscillatorNode, // The core LFO functionality
      auxiliaryNodes: { amplitudeGain: amplitudeGainNode }, // Store gain node if needed later
      paramTargetsForCv: paramTargetsForCv,
      definition: LFO_BLOCK_DEFINITION,
      instanceId: instanceId,
    };
  }

  updateNodeParams(managedNodeInfo: ManagedNativeNodeInfo, parameters: BlockParameter[]): void {
    if (!this.audioContext) {
      console.warn("AudioContext not available in LFONativeBlock during updateNodeParams.");
      return;
    }

    const oscillatorNode = managedNodeInfo.mainProcessingNode as OscillatorNode;
    // Retrieve the gain node stored in auxiliaryNodes
    const amplitudeGainNode = managedNodeInfo.auxiliaryNodes?.amplitudeGain as GainNode | undefined;

    if (!oscillatorNode) {
      console.error("OscillatorNode not found in managedNodeInfo for instanceId:", managedNodeInfo.instanceId);
      return;
    }
    if (!amplitudeGainNode) {
      console.error("Amplitude GainNode not found in managedNodeInfo for instanceId:", managedNodeInfo.instanceId);
      return;
    }

    const frequencyParam = parameters.find(p => p.id === 'frequency');
    if (frequencyParam && typeof frequencyParam.currentValue === 'number') {
      // Check if the value is substantially different to avoid flooding with updates if using setTargetAtTime
      if (Math.abs(oscillatorNode.frequency.value - frequencyParam.currentValue) > 0.001) {
        oscillatorNode.frequency.setTargetAtTime(frequencyParam.currentValue, this.audioContext.currentTime, 0.01);
      }
    }

    const waveformParam = parameters.find(p => p.id === 'waveform');
    if (waveformParam && typeof waveformParam.currentValue === 'string') {
      oscillatorNode.type = waveformParam.currentValue as OscillatorType;
    }

    const amplitudeParam = parameters.find(p => p.id === 'amplitude');
    if (amplitudeParam && typeof amplitudeParam.currentValue === 'number') {
       if (Math.abs(amplitudeGainNode.gain.value - amplitudeParam.currentValue) > 0.001) {
        amplitudeGainNode.gain.setTargetAtTime(amplitudeParam.currentValue, this.audioContext.currentTime, 0.01);
      }
    }
  }
}

export const LFO_BLOCK_DEFINITION: BlockDefinition = {
  id: 'lfo-native-v1',
  name: 'LFO (Native)',
  description: 'Generates a low-frequency audio signal for modulation. Its parameters control a native OscillatorNode and an optional internal GainNode for amplitude.',
  runsAtAudioRate: true,
  inputs: [
    // Optional: Inputs for frequency CV or reset could be added here later if needed.
    // For now, we align with the GainControl example where params are primary.
    // If we want to modulate frequency with another audio signal, we'd add:
    // { id: 'freq_cv_in', name: 'Frequency CV', type: 'audio', description: 'Modulates LFO frequency.', audioParamTarget: 'frequency' }
  ],
  outputs: [
    { id: 'audio_out', name: 'LFO Output', type: 'audio', description: 'The LFO signal output (native OscillatorNode possibly via an internal GainNode).' }
  ],
  parameters: createParameterDefinitions([
    {
      id: 'frequency',
      name: 'Frequency',
      type: 'slider',
      min: 0.1,
      max: 20,
      step: 0.01,
      defaultValue: 1,
      description: 'LFO frequency in Hz (controls OscillatorNode.frequency AudioParam).'
    },
    {
      id: 'waveform',
      name: 'Waveform',
      type: 'dropdown',
      options: [
        { value: 'sine', label: 'Sine' },
        { value: 'square', label: 'Square' },
        { value: 'sawtooth', label: 'Sawtooth' },
        { value: 'triangle', label: 'Triangle' }
      ],
      defaultValue: 'sine',
      description: 'LFO waveform shape (controls OscillatorNode.type).'
    },
    {
      id: 'amplitude',
      name: 'Amplitude',
      type: 'slider',
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 1,
      description: 'LFO output amplitude (controls an internal GainNode.gain AudioParam).'
    }
  ]),
};
