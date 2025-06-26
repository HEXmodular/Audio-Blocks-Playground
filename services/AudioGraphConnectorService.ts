/**
 * This service is responsible for managing the actual Web Audio API connections within an audio graph.
 * It dynamically establishes and tears down connections between various audio nodes (representing blocks or services) based on the application's desired state.
 * The service takes into account different types of audio sources and destinations, including standard AudioNodes, AudioWorklets, and their AudioParams, and handles specific logic for custom block types.
 * It maintains a record of active connections and intelligently updates them, only making necessary changes to reflect the current graph structure provided by the application.
 * Key functions include updating the graph with a new set of connections and disconnecting all existing connections, crucial for dynamic audio routing and responding to global audio state changes.
 */
import * as Tone from 'tone'; // Import Tone
import BlockStateManager, { InstanceUpdatePayload } from '@state/BlockStateManager'; // Added import
import ConnectionState from './ConnectionState';
import AudioNodeManager from './AudioNodeManager'; // Changed from NativeNodeManager

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

class AudioGraphConnectorService {
  private static instance: AudioGraphConnectorService;
  private activeWebAudioConnections: Map<string, ActiveWebAudioConnection>;

  private constructor() {
    this.activeWebAudioConnections = new Map<string, ActiveWebAudioConnection>();
    console.log('[🕸 AudioGraphConnectorService] Initialized');
  }

  public static getInstance(): AudioGraphConnectorService {
    if (!AudioGraphConnectorService.instance) {
      AudioGraphConnectorService.instance = new AudioGraphConnectorService();
    }
    return AudioGraphConnectorService.instance;
  }

  public updateConnections(
  ): InstanceUpdatePayload[] {

    const connections = ConnectionState.getConnections();
    const blockInstances = BlockStateManager.getBlockInstances();

    const localManagedNativeNodes = AudioNodeManager.getManagedNodesMap(); // Changed from NativeNodeManager
    // console.log("[🕸 AudioGraphConnectorService] Updating connections with local managed nodes:", localManagedNativeNodes);


    const instanceUpdates: InstanceUpdatePayload[] = [];
    const toneContext = Tone.getContext();
    if (toneContext?.state !== 'running') {
      this.activeWebAudioConnections.forEach(connInfo => {
        try {
          if (connInfo.targetParam) {
            (connInfo.sourceNode as any).disconnect(connInfo.targetParam as any);
          } else {
            (connInfo.sourceNode as any).disconnect(connInfo.targetNode as any);
          }
        } catch (e) { }
      });
      this.activeWebAudioConnections.clear();
      return instanceUpdates;
    }

    const newActiveConnections = new Map<string, ActiveWebAudioConnection>();

    // console.log("[AudioGraphConnectorService] Updating connections. Received connections array:", connections); // REMOVED

    connections.forEach(conn => {
      // console.log(`[AudioGraphConnectorService] Processing connection ID: ${conn.id}`); // REMOVED
      const fromInstance = blockInstances.find(b => b?.instanceId === conn.fromInstanceId);
      const toInstance = blockInstances.find(b => b?.instanceId === conn.toInstanceId);

      if (!fromInstance || !toInstance) return;

      const fromDef = fromInstance.definition;
      const toDef = toInstance.definition;

      if (!fromDef || !toDef) return;

      const outputPortDef = fromDef.outputs.find(p => p.id === conn.fromOutputId);
      const inputPortDef = toDef.inputs.find(p => p.id === conn.toInputId);

      if (!outputPortDef || !inputPortDef) return;

      // для пробрасывания эмитера получателю
      if (outputPortDef.type === 'gate' || outputPortDef.type === 'trigger') {
        const sourceManagedNodeInfo = localManagedNativeNodes.get(fromInstance.instanceId);
        const emitter = sourceManagedNodeInfo?.providerInstance?.getEmitter(conn.fromOutputId)
        if (emitter) {
          BlockStateManager.updateBlockInstance(
            toInstance.instanceId,
            {emitters: { [conn.toInputId]: emitter }}
          );

          // instanceUpdates.push({
          //   instanceId: toInstance.instanceId,
          //   updates: { internalState: { ...toInstance.internalState } }
          // });
        }
        return;
      } else if (outputPortDef.type === 'audio' && inputPortDef.type === 'audio') {
        let sourceNode: ConnectableSource | undefined;
        const fromNativeInfo = localManagedNativeNodes.get(fromInstance.instanceId);

        if (fromNativeInfo) sourceNode = fromNativeInfo.nodeForOutputConnections as ConnectableSource | undefined;

        if (!sourceNode) return;


        let targetNode: ConnectableTargetNode | undefined | null;
        let targetParam: ConnectableParam | undefined;

        const toNativeInfo = localManagedNativeNodes.get(toInstance.instanceId);

        if (inputPortDef.audioParamTarget) {
          if (toNativeInfo?.paramTargetsForCv?.has(inputPortDef.audioParamTarget)) {
            targetParam = toNativeInfo.paramTargetsForCv.get(inputPortDef.audioParamTarget);
            targetNode = (toNativeInfo.nodeForInputConnections || (toNativeInfo as any).toneOscillator || (toNativeInfo as any).toneGain || (toNativeInfo as any).toneFilter || (toNativeInfo as any).toneFeedbackDelay || (toNativeInfo as any).toneAmplitudeEnvelope) as ConnectableTargetNode | undefined;
            // console.log(`[AudioGraphConnectorService] Target param identified for ${toInstance.instanceId}: ${inputPortDef.audioParamTarget} on NativeNode`, targetParam); // REMOVED
          }
        } else if (toNativeInfo) {
          targetNode = toNativeInfo.nodeForInputConnections as ConnectableTargetNode | undefined;
          // console.log(`[AudioGraphConnectorService] Target node identified for ${toInstance.instanceId} (NativeNode):`, targetNode); // REMOVED
        }

        if (!targetNode && !targetParam) return;

        if (targetParam && !targetNode) {
          if (toNativeInfo) {
            targetNode = (toNativeInfo.nodeForInputConnections || (toNativeInfo as any).toneOscillator || (toNativeInfo as any).toneGain || (toNativeInfo as any).toneFilter || (toNativeInfo as any).toneFeedbackDelay || (toNativeInfo as any).toneAmplitudeEnvelope) as ConnectableTargetNode | undefined;
          }
        }

        if (sourceNode && targetParam && targetNode) {
          try {
            (sourceNode as any).connect(targetParam as any);
            console.log(`[🕸 AudioGraphConnectorService] Successfully connected source ${fromInstance.instanceId} to target param ${inputPortDef.audioParamTarget} of ${toInstance.instanceId}. ID: ${conn.id}`); // REMOVED
            newActiveConnections.set(conn.id, { connectionId: conn.id, sourceNode: sourceNode, targetNode: targetNode, targetParam: targetParam });
          } catch (e) {
            console.error(`[AudioGraphConnectorService Conn] Error (Param) for ID ${conn.id}: ${(e as Error).message}. From: ${fromDef.name}, To: ${toDef.name} (Param: ${inputPortDef.audioParamTarget})`);
          }
        } else if (sourceNode && targetNode) {
          try {
            (sourceNode as any).connect(targetNode as any);
            console.log(`[🕸 AudioGraphConnectorService] Successfully connected source ${fromInstance.instanceId} to target node ${toInstance.instanceId}. ID: ${conn.id}`); // REMOVED
            newActiveConnections.set(conn.id, { connectionId: conn.id, sourceNode: sourceNode, targetNode: targetNode });
          } catch (e) {
            console.error(`[AudioGraphConnectorService Conn] Error (Node) for ID ${conn.id}: ${(e as Error).message}. From: ${fromDef.name}, To: ${toDef.name}`);
          }
        }
      }
    });

    this.activeWebAudioConnections.forEach((oldConnInfo, oldConnId) => {
      if (!newActiveConnections.has(oldConnId)) {
        try {
          if (oldConnInfo.targetParam) {
            (oldConnInfo.sourceNode as any).disconnect(oldConnInfo.targetParam as any);
          } else {
            (oldConnInfo.sourceNode as any).disconnect(oldConnInfo.targetNode as any);
          }
        } catch (e) {
          console.warn(`[🕸 AudioGraphConnectorService] Error disconnecting old connection ${oldConnId}:`, e);
        }
      }
    });
    // console.log(`[AudioGraphConnectorService] Finished updating connections. Active Web Audio Connections (${this.activeWebAudioConnections.size}):`, this.activeWebAudioConnections); // REMOVED
    this.activeWebAudioConnections = newActiveConnections;
    return instanceUpdates;
  }

  public disconnectAll(): void {
    // console.log(`[AudioGraphConnectorService] disconnectAll called. Disconnecting ${this.activeWebAudioConnections.size} active web audio connections.`); // REMOVED
    this.activeWebAudioConnections.forEach((connInfo, connId) => {
      // console.log(`[AudioGraphConnectorService] Disconnecting connection: ${connId}`, connInfo); // REMOVED
      try {
        if (connInfo.targetParam) {
          (connInfo.sourceNode as any).disconnect(connInfo.targetParam as any);
          // console.log(`[AudioGraphConnectorService] Disconnected source from target param for ${connId}`); // REMOVED
        } else if (connInfo.targetNode) {
          (connInfo.sourceNode as any).disconnect(connInfo.targetNode as any);
          // console.log(`[AudioGraphConnectorService] Disconnected source from target node for ${connId}`); // REMOVED
        }
      } catch (e) {
        console.warn(`[🕸 AudioGraphConnectorService] Error during disconnection of ${connId}:`, e);
      }
    });
    this.activeWebAudioConnections.clear();
    // console.log('[AudioGraphConnectorService] All connections cleared.'); // REMOVED
  }
}

export default AudioGraphConnectorService.getInstance();
