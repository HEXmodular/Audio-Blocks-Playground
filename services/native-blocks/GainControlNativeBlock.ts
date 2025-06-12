import { NativeBlock } from './NativeBlock';
import type { BlockDefinition, BlockParameter } from '../../types'; // Added BlockParameter
import { createParameterDefinitions } from '../../constants';
import type { ManagedNativeNodeInfo } from '../NativeNodeManager'; // Added ManagedNativeNodeInfo

/**
 * GainControlNativeBlock is a native block that controls the gain of the audio.
 */
export class GainControlNativeBlock extends NativeBlock {
  // audioContext is inherited from NativeBlock constructor

  /**
   * Creates a new GainControlNativeBlock.
   * @param audioContext The audio context, can be null.
   */
  constructor(audioContext: AudioContext | null) { // Allow null for context
    super(audioContext); // Calls NativeBlock constructor
  }

  /**
   * Creates and configures a new GainNode based on the provided parameters.
   * @param instanceId The unique identifier for this node instance.
   * @param initialParams The initial parameters for the node (may not be strictly needed here).
   * @returns ManagedNativeNodeInfo an object containing the configured node and related information.
   */
  createNode(instanceId: string, initialParams: BlockParameter[]): ManagedNativeNodeInfo {
    if (!this.audioContext) {
      throw new Error("AudioContext not initialized in GainControlNativeBlock.");
    }
    const gainNode = this.audioContext.createGain();

    // Apply initial 'gain' parameter if provided in initialParams
    // This step is good practice, though updateNodeParams will also be called.
    const initialGainParam = initialParams.find(p => p.id === 'gain');
    if (initialGainParam && typeof initialGainParam.currentValue === 'number') {
      gainNode.gain.setValueAtTime(initialGainParam.currentValue, this.audioContext.currentTime);
    } else {
      // Set to default from definition if not in initialParams
      const defaultGainParam = GAIN_BLOCK_DEFINITION.parameters.find(p => p.id === 'gain');
      if (defaultGainParam && typeof defaultGainParam.defaultValue === 'number') {
        gainNode.gain.setValueAtTime(defaultGainParam.defaultValue, this.audioContext.currentTime);
      } else {
        gainNode.gain.setValueAtTime(1, this.audioContext.currentTime); // Fallback default
      }
    }

    const paramTargetsForCv = new Map<string, AudioParam>();
    paramTargetsForCv.set('gain', gainNode.gain);

    return {
      nodeForInputConnections: gainNode,
      nodeForOutputConnections: gainNode,
      mainProcessingNode: gainNode,
      paramTargetsForCv: paramTargetsForCv,
      definition: GAIN_BLOCK_DEFINITION,
      instanceId: instanceId,
    };
  }

  /**
   * Updates the parameters of an existing GainNode.
   * @param managedNodeInfo Information about the managed native node.
   * @param parameters The new parameters to apply.
   */
  updateNodeParams(managedNodeInfo: ManagedNativeNodeInfo, parameters: BlockParameter[]): void {
    if (!this.audioContext) {
      // It's possible audioContext might become null if disconnected later
      console.warn("AudioContext not available in GainControlNativeBlock during updateNodeParams.");
      return;
    }
    const gainNode = managedNodeInfo.mainProcessingNode as GainNode;
    if (!gainNode) {
      console.error("GainNode not found in managedNodeInfo for instanceId:", managedNodeInfo.instanceId);
      return;
    }

    const gainParam = parameters.find(p => p.id === 'gain');
    if (gainParam && typeof gainParam.currentValue === 'number') {
      gainNode.gain.setTargetAtTime(gainParam.currentValue, this.audioContext.currentTime, 0.01);
    }
  }
}

export const GAIN_BLOCK_DEFINITION: BlockDefinition = {
  id: 'gain-v1',
  name: 'Gain Control (Native)',
  description: 'Wraps a native Web Audio API GainNode. Amplifies or attenuates an audio signal. Its "gain" parameter controls the GainNode.gain AudioParam. Audio path is managed by Web Audio graph connections.',
  runsAtAudioRate: true,
  inputs: [
    { id: 'audio_in', name: 'Audio Input', type: 'audio', description: 'Signal to process (connects to native GainNode input in Web Audio graph)' },
    { id: 'gain_cv_in', name: 'Gain CV', type: 'audio', description: 'Modulates gain AudioParam directly in Web Audio graph.', audioParamTarget: 'gain' }
  ],
  outputs: [
    { id: 'audio_out', name: 'Audio Output', type: 'audio', description: 'Processed audio signal (from native GainNode output in Web Audio graph)' }
  ],
  parameters: createParameterDefinitions([
    { id: 'gain', name: 'Gain Factor', type: 'slider', min: 0, max: 2, step: 0.01, defaultValue: 1, description: 'Gain multiplier (AudioParam for native GainNode)' }
  ]),
  // logicCode and initialPrompt are not needed for native blocks managed by their own classes
};
