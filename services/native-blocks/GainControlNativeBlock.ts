import { CreatableNode } from './CreatableNode';
import type { BlockDefinition, BlockParameter } from '../../types';
import { createParameterDefinitions } from '../../constants';
import type { ManagedNativeNodeInfo } from '../NativeNodeManager';

/**
 * GainControlNativeBlock is a native block that controls the gain of the audio.
 */
export class GainControlNativeBlock extends CreatableNode {

  /**
   * Creates a new GainControlNativeBlock.
   * @param audioContext The audio context, can be null.
   */
  constructor(audioContext: AudioContext | null) {
    super(audioContext);
  }

  /**
   * Creates and configures a new GainNode based on the provided parameters.
   * @param instanceId The unique identifier for this node instance.
   * @param definition The block definition for this gain node.
   * @param initialParams The initial parameters for the node.
   * @param currentBpm Optional current BPM, not used by GainControl.
   * @returns ManagedNativeNodeInfo an object containing the configured node and related information.
   */
  createNode(
    instanceId: string,
    definition: BlockDefinition,
    initialParams: BlockParameter[],
    currentBpm?: number // Not used by Gain, but part of interface
  ): ManagedNativeNodeInfo {
    if (!this.audioContext) {
      throw new Error("AudioContext not initialized in GainControlNativeBlock.");
    }
    const gainNode = this.audioContext.createGain();

    const paramTargetsForCv = new Map<string, AudioParam>();
    paramTargetsForCv.set('gain', gainNode.gain);

    // Initial parameters are applied by NativeNodeManager calling updateNodeParams after this.
    // However, setting a default here ensures the node is in a valid state immediately.
    const gainParamDef = definition.parameters.find(p => p.id === 'gain');
    let initialGainValue = 1; // Default fallback
    if (gainParamDef && typeof gainParamDef.defaultValue === 'number') {
      initialGainValue = gainParamDef.defaultValue;
    }
    const initialGainParam = initialParams.find(p => p.id === 'gain');
    if (initialGainParam && typeof initialGainParam.currentValue === 'number') {
      initialGainValue = initialGainParam.currentValue;
    }
    gainNode.gain.setValueAtTime(initialGainValue, this.audioContext.currentTime);


    return {
      nodeForInputConnections: gainNode,
      nodeForOutputConnections: gainNode,
      mainProcessingNode: gainNode,
      paramTargetsForCv: paramTargetsForCv,
      definition: definition, // Use the passed definition
      instanceId: instanceId,
    };
  }

  /**
   * Updates the parameters of an existing GainNode.
   * @param info Information about the managed native node.
   * @param parameters The new parameters to apply.
   * @param currentInputs Optional current inputs, not used by GainControl.
   * @param currentBpm Optional current BPM, not used by GainControl.
   */
  updateNodeParams(
    info: ManagedNativeNodeInfo,
    parameters: BlockParameter[],
    currentInputs?: Record<string, any>, // Not used
    currentBpm?: number // Not used
  ): void {
    if (!this.audioContext) {
      console.warn("AudioContext not available in GainControlNativeBlock during updateNodeParams.");
      return;
    }
    // Ensure mainProcessingNode is a GainNode, which it should be based on createNode
    if (!info.mainProcessingNode || !(info.mainProcessingNode instanceof GainNode)) {
      console.error("Main processing node is not a GainNode for instanceId:", info.instanceId);
      return;
    }
    const gainNode = info.mainProcessingNode as GainNode;

    const gainParam = parameters.find(p => p.id === 'gain');
    if (gainParam && typeof gainParam.currentValue === 'number') {
      gainNode.gain.setTargetAtTime(gainParam.currentValue, this.audioContext.currentTime, 0.01);
    }
  }

  // connect and disconnect methods are inherited from NativeBlock (via CreatableNode).
  // CreatableNode is abstract, and NativeBlock's connect/disconnect are abstract.
  // If GainControlNativeBlock doesn't need specific connection logic beyond what NativeNodeManager handles
  // via nodeForInputConnections/nodeForOutputConnections, these can be minimal implementations
  // or the class itself could be abstract if CreatableNode doesn't provide concrete ones.
  // For now, let's assume NativeNodeManager handles connections.
  // If these methods were strictly abstract in a non-abstract CreatableNode, they'd need to be implemented.
  // Let's add stubs to satisfy potential abstract requirements if NativeBlock made them so.
  // However, the other CreatableNode children had them commented out, implying they are not strictly needed
  // if the class remains abstract or if the base provides non-abstract stubs.
  // Given CreatableNode is abstract, this class doesn't *have* to implement them if it too were abstract.
  // But we intend to instantiate it.
  // The other concrete NativeBlock children (Oscillator, etc.) had commented out connect/disconnect.
  // Let's follow that pattern for now, assuming they are not strictly needed for NativeNodeManager's operation.

  // connect(destination: AudioNode): void {
  //   console.warn("GainControlNativeBlock.connect() called - connection typically managed by AudioGraphConnectorService.");
  // }

  // disconnect(destination: AudioNode): void {
  //   console.warn("GainControlNativeBlock.disconnect() called - connection typically managed by AudioGraphConnectorService.");
  // }
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
