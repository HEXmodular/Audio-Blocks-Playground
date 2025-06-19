/**
 * This service is responsible for managing the actual Web Audio API connections within an audio graph.
 * It dynamically establishes and tears down connections between various audio nodes (representing blocks or services) based on the application's desired state.
 * The service takes into account different types of audio sources and destinations, including standard AudioNodes, AudioWorklets, and their AudioParams, and handles specific logic for custom block types.
 * It maintains a record of active connections and intelligently updates them, only making necessary changes to reflect the current graph structure provided by the application.
 * Key functions include updating the graph with a new set of connections and disconnecting all existing connections, crucial for dynamic audio routing and responding to global audio state changes.
 */
import * as Tone from 'tone'; // Import Tone
import {
    Connection,
    BlockInstance,
    BlockDefinition,
    ManagedWorkletNodeInfo,
    ManagedNativeNodeInfo,
    ManagedLyriaServiceInfo,
    EmitterProvider // Added import
} from '@interfaces/common';
import { InstanceUpdatePayload } from '@state/BlockStateManager'; // Added import

// Define a more generic type for connectable nodes/params
type ConnectableSource = Tone.ToneAudioNode | AudioWorkletNode | AudioNode; // AudioNode for Lyria or unrefactored
type ConnectableTargetNode = Tone.ToneAudioNode | AudioWorkletNode | AudioNode;
type ConnectableParam = Tone.Param | AudioParam | Tone.Signal<any>;


export interface ActiveWebAudioConnection {
  connectionId: string;
  sourceNode: ConnectableSource;
  targetNode: ConnectableTargetNode; // Target node, even if connecting to its param
  targetParam?: ConnectableParam;
}

export class AudioGraphConnectorService {
  private activeWebAudioConnections: Map<string, ActiveWebAudioConnection>;

  constructor() {
    this.activeWebAudioConnections = new Map<string, ActiveWebAudioConnection>();
    console.log('[AudioGraphConnectorService] Initialized');
  }

  public updateConnections(
    _audioContext: AudioContext | null, // Parameter kept for signature compatibility, but Tone.getContext() will be used
    isAudioGloballyEnabled: boolean,
    connections: Connection[],
    blockInstances: BlockInstance[],
    getDefinitionForBlock: (instance: BlockInstance) => BlockDefinition | undefined,
    managedWorkletNodes: Map<string, ManagedWorkletNodeInfo>,
    managedNativeNodes: Map<string, ManagedNativeNodeInfo>,
    managedLyriaServices: Map<string, ManagedLyriaServiceInfo>
  ): InstanceUpdatePayload[] { // Changed return type
    const instanceUpdates: InstanceUpdatePayload[] = []; // Initialized updates array
    const toneContext = Tone.getContext();
    if (!toneContext || !isAudioGloballyEnabled || toneContext.state !== 'running') {
      this.activeWebAudioConnections.forEach(connInfo => {
        try {
          if (connInfo.targetParam) {
            (connInfo.sourceNode as any).disconnect(connInfo.targetParam as any);
          } else {
            (connInfo.sourceNode as any).disconnect(connInfo.targetNode as any);
          }
        } catch (e) {
          // Errors are expected if context is closing or nodes are already gone.
        }
      });
      this.activeWebAudioConnections.clear();
      return instanceUpdates; // Return updates if exiting early
    }

    const newActiveConnections = new Map<string, ActiveWebAudioConnection>();

    connections.forEach(conn => {
      const fromInstance = blockInstances.find(b => b?.instanceId === conn.fromInstanceId);
      const toInstance = blockInstances.find(b => b?.instanceId === conn.toInstanceId);
      if (!fromInstance || !toInstance) return;

      const fromDef = getDefinitionForBlock(fromInstance);
      const toDef = getDefinitionForBlock(toInstance);
      if (!fromDef || !toDef) return;

      const outputPortDef = fromDef.outputs.find(p => p.id === conn.fromOutputId);
      const inputPortDef = toDef.inputs.find(p => p.id === conn.toInputId);

      if (!outputPortDef || !inputPortDef) return;

      // Handle Emitter propagation for 'gate' or 'trigger' types
      if (outputPortDef.type === 'gate' || outputPortDef.type === 'trigger') {
        const sourceManagedNodeInfo = managedNativeNodes.get(fromInstance.instanceId) /* || other manager maps */;
        // The prompt mentions providerInstance as hypothetical.
        // Assuming BlockStore holds instances and those instances might implement EmitterProvider
        // This part is highly dependent on where the actual EmitterProvider instance is stored.
        // For now, using the placeholder `providerInstance` on ManagedNativeNodeInfo.
        if (sourceManagedNodeInfo && (sourceManagedNodeInfo as any).providerInstance &&
            typeof ((sourceManagedNodeInfo as any).providerInstance as EmitterProvider).getEmitter === 'function') {
          const provider = (sourceManagedNodeInfo as any).providerInstance as EmitterProvider;
          const emitter = provider.getEmitter(conn.fromOutputId);

          if (emitter) {
            if (!toInstance.internalState) { // Should ideally not happen if BlockInstance is well-initialized
              toInstance.internalState = {};
            }
            if (!toInstance.internalState.emitters) {
              toInstance.internalState.emitters = {};
            }
            toInstance.internalState.emitters[conn.toInputId] = emitter;
            instanceUpdates.push({
              instanceId: toInstance.instanceId,
              updates: { internalState: { ...toInstance.internalState } }
            });
            console.log(`[AudioGraphConnectorService] Propagated emitter for connection ${conn.id} from ${conn.fromInstanceId}.${conn.fromOutputId} to ${conn.toInstanceId}.${conn.toInputId}`);
          }
        }
        // Gate/trigger connections do not create Web Audio API connections, so we return after handling emitters.
        return;
      } else if (outputPortDef.type === 'audio' && inputPortDef.type === 'audio') {
        // Existing logic for audio connections
        let sourceNode: ConnectableSource | undefined;
      const fromWorkletInfo = managedWorkletNodes.get(fromInstance.instanceId);
      const fromNativeInfo = managedNativeNodes.get(fromInstance.instanceId);
      const fromLyriaInfo = managedLyriaServices.get(fromInstance.instanceId);

      if (fromWorkletInfo) sourceNode = fromWorkletInfo.node;
      // For native (Tone.js based) nodes, nodeForOutputConnections should provide the correct Tone.ToneAudioNode
      else if (fromNativeInfo) sourceNode = fromNativeInfo.nodeForOutputConnections as ConnectableSource | undefined;
      else if (fromLyriaInfo) sourceNode = fromLyriaInfo.outputNode as ConnectableSource | undefined;


      if (!sourceNode) {
        // console.warn(`[AGC] Source node not found for instance ${fromInstance.instanceId}`);
        return; // Return for this connection if sourceNode not found
      }

      let targetNode: ConnectableTargetNode | undefined | null;
      let targetParam: ConnectableParam | undefined;

      const toWorkletInfo = managedWorkletNodes.get(toInstance.instanceId);
      const toNativeInfo = managedNativeNodes.get(toInstance.instanceId);

      if (inputPortDef.audioParamTarget) {
        if (toWorkletInfo?.node?.parameters?.has(inputPortDef.audioParamTarget)) {
          targetParam = toWorkletInfo.node.parameters.get(inputPortDef.audioParamTarget);
          targetNode = toWorkletInfo.node; // The node hosting the parameter
        } else if (toNativeInfo?.paramTargetsForCv?.has(inputPortDef.audioParamTarget)) {
          targetParam = toNativeInfo.paramTargetsForCv.get(inputPortDef.audioParamTarget);
          // Determine the actual Tone.js node that hosts this param.
          // This could be the main tone node, or a sub-component.
          // For simplicity, assume paramTargetsForCv provides a connectable Param/Signal.
          // The targetNode in ActiveWebAudioConnection should be the node to which the param belongs,
          // which is generally the main node exposed by nodeForInputConnections or a specific tone... field.
          targetNode = (toNativeInfo.nodeForInputConnections || (toNativeInfo as any).toneOscillator || (toNativeInfo as any).toneGain || (toNativeInfo as any).toneFilter || (toNativeInfo as any).toneFeedbackDelay || (toNativeInfo as any).toneAmplitudeEnvelope) as ConnectableTargetNode | undefined;

        }
      } else { // Not an audioParamTarget, direct node-to-node connection
        if (toWorkletInfo) {
            targetNode = toWorkletInfo.node;
        } else if (toNativeInfo) {
            targetNode = toNativeInfo.nodeForInputConnections as ConnectableTargetNode | undefined;
        }
      }

      if (!targetNode && !targetParam) {
        // console.warn(`[AGC] Target node or param not found for instance ${toInstance.instanceId}, input ${inputPortDef.id}`);
        return;
      }

      // Ensure targetNode is set if targetParam is defined (for ActiveWebAudioConnection structure)
      if (targetParam && !targetNode && toNativeInfo) {
        // Try to assign a sensible targetNode if only param was found.
        targetNode = (toNativeInfo.nodeForInputConnections || (toNativeInfo as any).toneOscillator || (toNativeInfo as any).toneGain || (toNativeInfo as any).toneFilter || (toNativeInfo as any).toneFeedbackDelay || (toNativeInfo as any).toneAmplitudeEnvelope) as ConnectableTargetNode | undefined;
      }
      if (targetParam && !targetNode && toWorkletInfo) {
        targetNode = toWorkletInfo.node;
      }


      if (sourceNode && targetParam && targetNode) { // Ensure targetNode is available for context
        try {
          (sourceNode as any).connect(targetParam as any);
          newActiveConnections.set(conn.id, { connectionId: conn.id, sourceNode: sourceNode, targetNode: targetNode, targetParam: targetParam });
        } catch (e) {
          console.error(`[AudioGraphConnectorService Conn] Error (Param) for ID ${conn.id}: ${(e as Error).message}. From: ${fromDef.name}, To: ${toDef.name} (Param: ${inputPortDef.audioParamTarget})`);
        }
      } else if (sourceNode && targetNode) {
        try {
          (sourceNode as any).connect(targetNode as any);
          newActiveConnections.set(conn.id, { connectionId: conn.id, sourceNode: sourceNode, targetNode: targetNode });
        } catch (e) {
          console.error(`[AudioGraphConnectorService Conn] Error (Node) for ID ${conn.id}: ${(e as Error).message}. From: ${fromDef.name}, To: ${toDef.name}`);
        }
      }
    });

    // Disconnect old connections that are no longer active
    this.activeWebAudioConnections.forEach((oldConnInfo, oldConnId) => {
      if (!newActiveConnections.has(oldConnId)) {
        // This connection is being removed
        try {
          // Standard audio disconnection
          if (oldConnInfo.targetParam) {
            (oldConnInfo.sourceNode as any).disconnect(oldConnInfo.targetParam as any);
          } else {
            (oldConnInfo.sourceNode as any).disconnect(oldConnInfo.targetNode as any);
          }

          // Emitter cleanup logic
          // Try to find the original connection details to check its type for emitter cleanup.
          // This relies on the assumption that `connections` might still contain it if it's being modified,
          // or requires a more robust way to get old connection details.
          const originalConn = connections.find(c => c.id === oldConnInfo.connectionId);
          if (originalConn) {
            const fromInstance = blockInstances.find(b => b?.instanceId === originalConn.fromInstanceId);
            const toInstance = blockInstances.find(b => b?.instanceId === originalConn.toInstanceId);
            if (fromInstance && toInstance) {
              const fromDef = getDefinitionForBlock(fromInstance);
              // const toDef = getDefinitionForBlock(toInstance); // Not strictly needed for output check
              if (fromDef) {
                const outputPortDef = fromDef.outputs.find(p => p.id === originalConn.fromOutputId);
                if (outputPortDef && (outputPortDef.type === 'gate' || outputPortDef.type === 'trigger')) {
                  if (toInstance.internalState && toInstance.internalState.emitters && toInstance.internalState.emitters[originalConn.toInputId]) {
                    delete toInstance.internalState.emitters[originalConn.toInputId];
                    instanceUpdates.push({
                      instanceId: toInstance.instanceId,
                      updates: { internalState: { ...toInstance.internalState } }
                    });
                    console.log(`[AudioGraphConnectorService] Cleared emitter for disconnected connection ${oldConnInfo.connectionId} on ${originalConn.toInstanceId}.${originalConn.toInputId}`);
                  }
                }
              }
            }
          } else {
            // If originalConn is not found in the current `connections` list, it means the connection was entirely removed.
            // We lack enough info in oldConnInfo to reliably clean up emitters without structural changes
            // to ActiveWebAudioConnection or how old connections are tracked.
            // console.warn(`[AudioGraphConnectorService] Could not find original connection details for ${oldConnId} to perform emitter cleanup.`);
          }

        } catch (e) { /* Ignore errors, node might already be gone */ }
      }
    });
    this.activeWebAudioConnections = newActiveConnections;
    return instanceUpdates; // Return all collected updates
  }

  public disconnectAll(): void {
    console.log(`[AudioGraphConnectorService] Disconnecting all ${this.activeWebAudioConnections.size} connections.`);
    this.activeWebAudioConnections.forEach(connInfo => {
        try {
          if (connInfo.targetParam) {
            (connInfo.sourceNode as any).disconnect(connInfo.targetParam as any);
          } else if (connInfo.targetNode) {
            (connInfo.sourceNode as any).disconnect(connInfo.targetNode as any);
          }
        } catch (e) {
          // console.warn(`[AudioGraphConnectorService] Error during disconnectAll for connection ${connInfo.connectionId}: ${(e as Error).message}`);
        }
      });
    this.activeWebAudioConnections.clear();
  }
}
