/**
 * This service is responsible for managing the actual Web Audio API connections within an audio graph.
 * It dynamically establishes and tears down connections between various audio nodes (representing blocks or services) based on the application's desired state.
 * The service takes into account different types of audio sources and destinations, including standard AudioNodes, AudioWorklets, and their AudioParams, and handles specific logic for custom block types.
 * It maintains a record of active connections and intelligently updates them, only making necessary changes to reflect the current graph structure provided by the application.
 * Key functions include updating the graph with a new set of connections and disconnecting all existing connections, crucial for dynamic audio routing and responding to global audio state changes.
 */
import {
    Connection,
    BlockInstance,
    BlockDefinition,
    ManagedWorkletNodeInfo, // Import from common
    ManagedNativeNodeInfo,  // Import from common
    ManagedLyriaServiceInfo // Import from common
} from '@interfaces/common';
// import { AUDIO_OUTPUT_BLOCK_DEFINITION } from '@constants/constants'; // Removed
// import { AudioOutputNativeBlock } from '../native-blocks/AudioOutputNativeBlock'; // Removed as unused

export interface ActiveWebAudioConnection {
  connectionId: string;
  sourceNode: AudioNode;
  targetNode: AudioNode;
  targetParam?: AudioParam;
}

export class AudioGraphConnectorService {
  private activeWebAudioConnections: Map<string, ActiveWebAudioConnection>;

  constructor() {
    this.activeWebAudioConnections = new Map<string, ActiveWebAudioConnection>();
    console.log('[AudioGraphConnectorService] Initialized');
  }

  public updateConnections(
    audioContext: AudioContext | null,
    isAudioGloballyEnabled: boolean,
    connections: Connection[],
    blockInstances: BlockInstance[],
    getDefinitionForBlock: (instance: BlockInstance) => BlockDefinition | undefined,
    managedWorkletNodes: Map<string, ManagedWorkletNodeInfo>, // Now uses type from common
    managedNativeNodes: Map<string, ManagedNativeNodeInfo>,   // Now uses type from common
    managedLyriaServices: Map<string, ManagedLyriaServiceInfo> // Now uses type from common
  ): void {
    if (!audioContext || !isAudioGloballyEnabled || audioContext.state !== 'running') {
      this.activeWebAudioConnections.forEach(connInfo => {
        try {
          if (connInfo.targetParam) {
            connInfo.sourceNode.disconnect(connInfo.targetParam);
          } else {
            connInfo.sourceNode.disconnect(connInfo.targetNode);
          }
        } catch (e) {
          // Errors are expected if context is closing or nodes are already gone.
        }
      });
      this.activeWebAudioConnections.clear();
      return;
    }

    const newActiveConnections = new Map<string, ActiveWebAudioConnection>();

    connections.forEach(conn => {
      const fromInstance = blockInstances.find(b => b.instanceId === conn.fromInstanceId);
      const toInstance = blockInstances.find(b => b.instanceId === conn.toInstanceId);
      if (!fromInstance || !toInstance) return;

      const fromDef = getDefinitionForBlock(fromInstance);
      const toDef = getDefinitionForBlock(toInstance);
      if (!fromDef || !toDef) return;

      const outputPortDef = fromDef.outputs.find(p => p.id === conn.fromOutputId);
      const inputPortDef = toDef.inputs.find(p => p.id === conn.toInputId);
      if (!outputPortDef || !inputPortDef || outputPortDef.type !== 'audio' || inputPortDef.type !== 'audio') return;

      let sourceAudioNode: AudioNode | undefined;
      const fromWorkletInfo = managedWorkletNodes.get(fromInstance.instanceId);
      const fromNativeInfo = managedNativeNodes.get(fromInstance.instanceId);
      const fromLyriaInfo = managedLyriaServices.get(fromInstance.instanceId);

      if (fromWorkletInfo) sourceAudioNode = fromWorkletInfo.node;
      else if (fromNativeInfo) sourceAudioNode = fromNativeInfo.nodeForOutputConnections;
      else if (fromLyriaInfo) sourceAudioNode = fromLyriaInfo.outputNode;

      if (!sourceAudioNode) return;

      let targetAudioNode: AudioNode | undefined | null;
      let targetAudioParam: AudioParam | undefined;

      const toWorkletInfo = managedWorkletNodes.get(toInstance.instanceId);
      const toNativeInfo = managedNativeNodes.get(toInstance.instanceId);

      if (inputPortDef.audioParamTarget) {
        if (toWorkletInfo?.node?.parameters?.has(inputPortDef.audioParamTarget)) {
          targetAudioParam = toWorkletInfo.node.parameters.get(inputPortDef.audioParamTarget);
          targetAudioNode = toWorkletInfo.node;
        } else if (toNativeInfo?.paramTargetsForCv?.has(inputPortDef.audioParamTarget)) {
          targetAudioParam = toNativeInfo.paramTargetsForCv.get(inputPortDef.audioParamTarget);
          targetAudioNode = toNativeInfo.node; // Assuming .node is the main node for param targeting
        } 
        // else if (toNativeInfo?.allpassInternalNodes && inputPortDef.audioParamTarget === 'delayTime') {
        //     targetAudioParam = toNativeInfo.allpassInternalNodes.inputDelay.delayTime;
        //     targetAudioNode = toNativeInfo.allpassInternalNodes.inputDelay;
        // } else if (toNativeInfo?.allpassInternalNodes && inputPortDef.audioParamTarget === 'coefficient') {
        //     targetAudioParam = toNativeInfo.allpassInternalNodes.feedbackGain.gain;
        //     targetAudioNode = toNativeInfo.allpassInternalNodes.feedbackGain;
        // }
      } else { // Not an audioParamTarget
        if (toWorkletInfo) { // If the target is a worklet-based block
            // Removed special handling for old AUDIO_OUTPUT_BLOCK_DEFINITION.id
            targetAudioNode = toWorkletInfo.node;
        } else if (toNativeInfo) { // If the target is a native-based block
            // For AudioOutputNativeBlock, toNativeInfo.nodeForInputConnections is its internalGainNode.
            // This also applies to other native blocks.
            // The AllpassFilterNativeBlock might have more complex internal routing needs,
            // but its basic input should also be nodeForInputConnections.
            // For now, using the general case:
            targetAudioNode = toNativeInfo.nodeForInputConnections;
            // TODO: Review if AllpassFilterNativeBlock or other native blocks need more specific connection logic here.
            // The previously commented out Allpass logic:
            // if (toDef.id === AllpassFilterNativeBlock.getDefinition().id && toNativeInfo.allpassInternalNodes) {
            //     if (sourceAudioNode && toNativeInfo.allpassInternalNodes.inputGain1 && toNativeInfo.allpassInternalNodes.inputPassthroughNode) {
            //         try {
            //             sourceAudioNode.connect(toNativeInfo.allpassInternalNodes.inputGain1);
            //             newActiveConnections.set(`${conn.id}-path1`, { connectionId: conn.id, sourceNode: sourceAudioNode, targetNode: toNativeInfo.allpassInternalNodes.inputGain1 });
            //             sourceAudioNode.connect(toNativeInfo.allpassInternalNodes.inputPassthroughNode);
            //             newActiveConnections.set(`${conn.id}-path2`, { connectionId: conn.id, sourceNode: sourceAudioNode, targetNode: toNativeInfo.allpassInternalNodes.inputPassthroughNode });
            //         } catch (e) { console.error(`[AudioGraphConnectorService Conn] Error connecting to Allpass internal for ${conn.id}: ${(e as Error).message}`); }
            //         targetAudioNode = null; // Set to null because connections are handled, or this indicates a multi-input node.
            //     }
            // } else {
            //      targetAudioNode = toNativeInfo.nodeForInputConnections;
            // }
        }
      }
      // console.log(`[AudioGraphConnectorService] trying to connect`, {sourceAudioNode, targetAudioParam, targetAudioNode});
      if (sourceAudioNode && targetAudioParam && targetAudioNode) {
        try {
          console.log(`[AudioGraphConnectorService] connected 1`, {sourceAudioNode, targetAudioParam, targetAudioNode});
          sourceAudioNode.connect(targetAudioParam);
          newActiveConnections.set(conn.id, { connectionId: conn.id, sourceNode: sourceAudioNode, targetNode: targetAudioNode, targetParam: targetAudioParam });
        } catch (e) {
          console.error(`[AudioGraphConnectorService Conn] Error (Param) for ID ${conn.id}: ${(e as Error).message}. From: ${fromDef.name}, To: ${toDef.name} (Param: ${inputPortDef.audioParamTarget})`);
        }
      } else if (sourceAudioNode && targetAudioNode) {
        try {
          console.log(`[AudioGraphConnectorService] connected 2`, {sourceAudioNode, targetAudioParam, targetAudioNode});
          sourceAudioNode.connect(targetAudioNode);
          newActiveConnections.set(conn.id, { connectionId: conn.id, sourceNode: sourceAudioNode, targetNode: targetAudioNode });
        } catch (e) {
          console.error(`[AudioGraphConnectorService Conn] Error (Node) for ID ${conn.id}: ${(e as Error).message}. From: ${fromDef.name}, To: ${toDef.name}`);
        }
      }
    });

    this.activeWebAudioConnections.forEach((oldConnInfo, oldConnId) => {
      if (!newActiveConnections.has(oldConnId)) {
        try {
          if (oldConnInfo.targetParam) {
            oldConnInfo.sourceNode.disconnect(oldConnInfo.targetParam);
          } else {
            oldConnInfo.sourceNode.disconnect(oldConnInfo.targetNode);
          }
        } catch (e) { /* Ignore errors, node might already be gone */ }
      }
    });
    this.activeWebAudioConnections = newActiveConnections;
  }

  public disconnectAll(): void {
    console.log(`[AudioGraphConnectorService] Disconnecting all ${this.activeWebAudioConnections.size} connections.`);
    this.activeWebAudioConnections.forEach(connInfo => {
        try {
          if (connInfo.targetParam) {
            connInfo.sourceNode.disconnect(connInfo.targetParam);
          } else if (connInfo.targetNode) {
            connInfo.sourceNode.disconnect(connInfo.targetNode);
          }
        } catch (e) {
          // console.warn(`[AudioGraphConnectorService] Error during disconnectAll for connection ${connInfo.connectionId}: ${(e as Error).message}`);
        }
      });
    this.activeWebAudioConnections.clear();
  }
}
