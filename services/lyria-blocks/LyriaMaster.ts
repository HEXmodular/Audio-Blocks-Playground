import {
  BlockDefinition,
  BlockParameter,
  ManagedNativeNodeInfo,
} from '@interfaces/common';
import { CreatableNode } from '../native-blocks/CreatableNode';

// TODO(b/336360895): Implement actual buffer loading and management.
// For now, the 'buffer' parameter will be a placeholder.

export class LyriaMasterBlock implements CreatableNode {
  private audioContext: AudioContext | null = null;

  constructor(context: AudioContext) {
    this.audioContext = context;
  }

  setAudioContext(context: AudioContext | null): void {
    this.audioContext = context;
  }

  static getDefinition(): BlockDefinition {
    return {
      id: 'lyria-master-v1',
      name: 'Lyria Master',
      description: 'Plays an audio buffer. The master audio generation block for Lyria.',
      inputs: [],
      outputs: [
        {
          id: 'audio_out',
          name: 'Audio Output',
          type: 'audio',
          description: 'The output of the AudioBufferSourceNode.',
        },
      ],
      parameters: [
        {
          id: 'buffer',
          name: 'Audio Buffer',
          type: 'text_input', // Placeholder: Actual type for AudioBuffer ID needed
          description: 'The audio buffer to play. (Currently a placeholder)',
          defaultValue: '',
        },
        {
          id: 'loop',
          name: 'Loop',
          type: 'toggle',
          description: 'Whether the audio should loop.',
          defaultValue: false,
        },
        {
          id: 'loopStart',
          name: 'Loop Start',
          type: 'number_input',
          description: 'The time in seconds at which looping should start.',
          defaultValue: 0,
          min: 0,
        },
        {
          id: 'loopEnd',
          name: 'Loop End',
          type: 'number_input',
          description: 'The time in seconds at which looping should end.',
          defaultValue: 0,
          min: 0,
        },
        {
          id: 'playbackRate',
          name: 'Playback Rate',
          type: 'slider', // Or 'number_input'
          description: 'The speed at which the audio is played.',
          defaultValue: 1,
          min: 0,
          max: 4, // Example max, adjust as needed
          step: 0.01,
        },
      ],
      logicCode: '', // Required by BlockDefinition
      // editorComponent: 'LyriaMasterEditor', // Removed, not in BlockDefinition
      maxInstances: 1, // Typically, there's only one master output
    } as BlockDefinition; // Cast to BlockDefinition to help catch future errors
  }

  createNode(
    instanceId: string,
    definition: BlockDefinition,
    initialParams: BlockParameter[]
  ): ManagedNativeNodeInfo {
    if (!this.audioContext) {
      throw new Error('AudioContext not set for LyriaMasterBlock');
    }

    const sourceNode = this.audioContext.createBufferSource();

    const nodeInfo: ManagedNativeNodeInfo = {
      instanceId,
      definition,
      node: sourceNode,
      nodeForInputConnections: sourceNode, // Or null if it truly accepts no inputs via connect
      nodeForOutputConnections: sourceNode,
      mainProcessingNode: sourceNode,
      paramTargetsForCv: new Map(), // Empty for now
    };

    // Apply initial parameters
    this.updateNodeParams(nodeInfo, initialParams);

    return nodeInfo;
  }

  updateNodeParams(
    nodeInfo: ManagedNativeNodeInfo,
    parameters: BlockParameter[]
  ): void {
    const sourceNode = nodeInfo.node as AudioBufferSourceNode;
    if (!sourceNode) {
      console.warn('LyriaMasterBlock: AudioBufferSourceNode not found in nodeInfo for updateNodeParams.');
      return;
    }

    parameters.forEach(param => {
      switch (param.id) {
        case 'buffer':
          // TODO(b/336360895): Handle buffer loading.
          // For now, we'll log a warning if a buffer value is provided,
          // as we don't have a way to load it yet.
          if (param.currentValue) {
            console.warn(
              `LyriaMasterBlock: Buffer parameter is set to '${param.currentValue}' but buffer loading is not yet implemented.`
            );
          }
          // sourceNode.buffer = ...; // This will require a loaded AudioBuffer
          break;
        case 'loop':
          sourceNode.loop = param.currentValue as boolean;
          break;
        case 'loopStart':
          sourceNode.loopStart = param.currentValue as number;
          break;
        case 'loopEnd':
          sourceNode.loopEnd = param.currentValue as number;
          break;
        case 'playbackRate':
          if (sourceNode.playbackRate) {
            sourceNode.playbackRate.setValueAtTime(
              param.currentValue as number,
              this.audioContext?.currentTime ?? 0
            );
          }
          break;
      }
    });
  }

  connect(): void {
    console.warn(
      "LyriaMasterBlock: 'connect' method is not implemented and should not be called directly for master blocks."
    );
  }

  disconnect(): void {
    console.warn(
      "LyriaMasterBlock: 'disconnect' method is not implemented and should not be called directly for master blocks."
    );
  }
}
