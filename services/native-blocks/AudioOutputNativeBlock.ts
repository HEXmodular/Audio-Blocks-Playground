import type { BlockDefinition, BlockParameter } from '@interfaces/common';
import type { ManagedNativeNodeInfo } from '@services/NativeNodeManager';
import { CreatableNode } from './CreatableNode';
import { createParameterDefinitions } from '@constants/constants'; // Assuming this is still needed

// Constants moved from constants.ts
export const SAMPLE_BUFFER_PROCESSOR_NAME = 'sample-buffer-processor';
export const SAMPLE_BUFFER_WORKLET_CODE = `
class SampleBufferProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [];
  }

  constructor(options) {
    super(options);
    this.instanceId = options?.processorOptions?.instanceId || 'UnknownSampleBufferWorklet';
    this.recentSamples = new Float32Array(1024); // Store last 1024 samples
    this.recentSamplesWritePtr = 0;

    this.port.onmessage = (event) => {
      if (event.data?.type === 'GET_RECENT_SAMPLES') {
        // To return samples in chronological order (oldest to newest)
        // we create a new array and fill it by reading from the circular buffer.
        const orderedSamples = new Float32Array(this.recentSamples.length);
        let readPtr = this.recentSamplesWritePtr;
        for (let i = 0; i < this.recentSamples.length; i++) {
          orderedSamples[i] = this.recentSamples[readPtr];
          readPtr = (readPtr + 1) % this.recentSamples.length;
        }
        this.port.postMessage({ type: 'RECENT_SAMPLES_DATA', samples: orderedSamples });
      }
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (input && input.length > 0 && output && output.length > 0) {
      const inputChannel = input[0];
      const outputChannel = output[0];
      if (inputChannel && outputChannel) {
        for (let i = 0; i < outputChannel.length; ++i) {
          const sample = inputChannel[i] !== undefined ? inputChannel[i] : 0;
          outputChannel[i] = sample;

          // Store in circular buffer
          this.recentSamples[this.recentSamplesWritePtr] = sample;
          this.recentSamplesWritePtr = (this.recentSamplesWritePtr + 1) % this.recentSamples.length;
        }
      }
    } else if (output && output.length > 0) {
      const outputChannel = output[0];
      if (outputChannel) {
        for (let i = 0; i < outputChannel.length; ++i) {
          outputChannel[i] = 0;
           // Store silence in circular buffer if no input
          this.recentSamples[this.recentSamplesWritePtr] = 0;
          this.recentSamplesWritePtr = (this.recentSamplesWritePtr + 1) % this.recentSamples.length;
        }
      }
    }
    return true;
  }
}
// IMPORTANT: The registerProcessor call will be done by the host environment (useAudioEngine)
`;

export const AUDIO_OUTPUT_BLOCK_DEFINITION: BlockDefinition = {
  id: 'system-audio-output-v1',
  name: 'Audio Output',
  description: 'Plays the incoming audio signal. Contains an internal GainNode for volume control which then feeds a SampleBufferProcessor AudioWorklet (acting as a sink). The input port connects to this internal GainNode.',
  runsAtAudioRate: true,
  inputs: [
    { id: 'audio_in', name: 'Audio Input', type: 'audio', description: 'Signal to play. Connects to the internal volume GainNode.' }
  ],
  outputs: [],
  parameters: createParameterDefinitions([
    { id: 'volume', name: 'Volume', type: 'slider', min: 0, max: 1, step: 0.01, defaultValue: 0.7, description: 'Output volume level (controls an internal GainNode AudioParam)' }
  ]),
  audioWorkletProcessorName: SAMPLE_BUFFER_PROCESSOR_NAME,
  audioWorkletCode: SAMPLE_BUFFER_WORKLET_CODE,
  logicCode: '// Native Audio Output - Logic handled by AudioOutputNativeBlock class',
  initialPrompt: 'System Audio Output Block, managed by AudioOutputNativeBlock.',
};

export class AudioOutputNativeBlock extends CreatableNode {
  constructor(audioContext: AudioContext | null) {
    super(audioContext);
  }

  createNode(
    instanceId: string,
    definition: BlockDefinition, // Should be AUDIO_OUTPUT_BLOCK_DEFINITION
    initialParams: BlockParameter[],
    _currentBpm?: number // Not used by AudioOutput
  ): ManagedNativeNodeInfo {
    if (!this.audioContext) {
      throw new Error("AudioContext is not initialized for AudioOutputNativeBlock.");
    }

    const volumeNode = this.audioContext.createGain();

    // Ensure the AudioWorklet module is added. This is typically handled by AudioEngineService
    // when it first encounters a block definition with worklet code.
    // If not, this line would throw an error.
    const workletNode = new AudioWorkletNode(this.audioContext, SAMPLE_BUFFER_PROCESSOR_NAME, {
      processorOptions: { instanceId: instanceId } // Pass instanceId to worklet
    });

    volumeNode.connect(workletNode);
    workletNode.connect(this.audioContext.destination);

    const paramTargetsForCv = new Map<string, AudioParam>();
    paramTargetsForCv.set('volume', volumeNode.gain);

    // Apply initial volume
    const volumeParamDef = definition.parameters.find(p => p.id === 'volume');
    let initialVolume = 0.7; // Default fallback
    if (volumeParamDef && typeof volumeParamDef.defaultValue === 'number') {
      initialVolume = volumeParamDef.defaultValue;
    }
    const initialVolumeParam = initialParams.find(p => p.id === 'volume');
    if (initialVolumeParam && typeof initialVolumeParam.currentValue === 'number') {
      initialVolume = initialVolumeParam.currentValue;
    }
    volumeNode.gain.setValueAtTime(initialVolume, this.audioContext.currentTime);

    return {
      nodeForInputConnections: volumeNode,
      nodeForOutputConnections: workletNode, // Technically outputs to destination, but this is the last managed node.
      mainProcessingNode: workletNode,
      internalGainNode: volumeNode,
      paramTargetsForCv: paramTargetsForCv,
      definition: definition,
      instanceId: instanceId,
    };
  }

  updateNodeParams(
    info: ManagedNativeNodeInfo,
    parameters: BlockParameter[],
    _currentInputs?: Record<string, any>, // Not used
    _currentBpm?: number // Not used
  ): void {
    if (!this.audioContext) {
      console.warn("AudioContext not available in AudioOutputNativeBlock during updateNodeParams.");
      return;
    }
    if (!info.internalGainNode || !(info.internalGainNode instanceof GainNode)) {
      console.error("Internal GainNode is not available or not a GainNode for instanceId:", info.instanceId);
      return;
    }

    const volumeParam = parameters.find(p => p.id === 'volume');
    if (volumeParam && typeof volumeParam.currentValue === 'number') {
      info.internalGainNode.gain.setTargetAtTime(volumeParam.currentValue, this.audioContext.currentTime, 0.01);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  connect(_downstreamNode: AudioNode, _outputIndex?: number, _inputIndex?: number): void {
    // AudioOutputNativeBlock connects to audioContext.destination directly in createNode.
    // This method might be called by a generic connection logic, but output connections
    // for this specific block are not managed conventionally.
    console.warn(`AudioOutputNativeBlock (${this.constructor.name}) connect() called, but it manages its own connection to destination.`);
  }

  disconnect(): void {
    // Disconnection logic should be handled by NativeNodeManager's removeManagedNativeNode,
    // which disconnects all nodes associated with the instance.
    // This class might not need to hold direct references to nodes for individual disconnection here
    // if NativeNodeManager handles it based on ManagedNativeNodeInfo.
    console.warn(`AudioOutputNativeBlock (${this.constructor.name}) disconnect() called. Node disconnection is typically managed by NativeNodeManager.`);
  }
}
