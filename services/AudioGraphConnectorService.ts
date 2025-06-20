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
import { BlockStateManager, InstanceUpdatePayload } from '@state/BlockStateManager'; // Added import
import { ConnectionState } from './ConnectionState';
import  NativeNodeManager  from './NativeNodeManager';
import AudioWorkletManager from './AudioWorkletManager';
import LyriaServiceManager from './LyriaServiceManager';

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
    console.log('[🔌 AudioGraphConnectorService] Initialized');
  }

  public static getInstance(): AudioGraphConnectorService {
    if (!AudioGraphConnectorService.instance) {
      AudioGraphConnectorService.instance = new AudioGraphConnectorService();
    }
    return AudioGraphConnectorService.instance;
  }

  public updateConnections(
    // _audioContext: AudioContext | null,
    // isAudioGloballyEnabled: boolean,
    // connections: Connection[],
    // blockInstances: BlockInstance[],
    // getDefinitionForBlock: (instance: BlockInstance) => BlockDefinition | undefined,
    // managedWorkletNodes: Map<string, ManagedWorkletNodeInfo>,
    // managedNativeNodes: Map<string, ManagedNativeNodeInfo>,
    // managedLyriaServices: Map<string, ManagedLyriaServiceInfo>
  ): InstanceUpdatePayload[] {

    const connections = ConnectionState.getInstance().getConnections();
    const blockInstances = BlockStateManager.getInstance().getBlockInstances();
    const getDefinitionForBlock = BlockStateManager.getInstance().getDefinitionForBlock;

    const managedWorkletNodes = NativeNodeManager.getManagedNodesMap()
    const managedNativeNodes= AudioWorkletManager.getManagedNodesMap()
    const managedLyriaServices = LyriaServiceManager.getManagedServicesMap();


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

    console.log("[AudioGraphConnectorService] Updating connections. Received connections array:", connections);

    connections.forEach(conn => {
      console.log(`[AudioGraphConnectorService] Processing connection ID: ${conn.id}`);
      const fromInstance = blockInstances.find(b => b?.instanceId === conn.fromInstanceId);
      const toInstance = blockInstances.find(b => b?.instanceId === conn.toInstanceId);

      if (fromInstance) {
        console.log(`[AudioGraphConnectorService] From instance: ${fromInstance.name} (ID: ${fromInstance.instanceId})`);
      } else {
        console.log(`[AudioGraphConnectorService] From instance with ID ${conn.fromInstanceId} not found.`);
      }
      if (toInstance) {
        console.log(`[AudioGraphConnectorService] To instance: ${toInstance.name} (ID: ${toInstance.instanceId})`);
      } else {
        console.log(`[AudioGraphConnectorService] To instance with ID ${conn.toInstanceId} not found.`);
      }

      if (!fromInstance || !toInstance) return;

      const fromDef = getDefinitionForBlock(fromInstance);
      const toDef = getDefinitionForBlock(toInstance);

      if (fromDef) {
        console.log(`[AudioGraphConnectorService] From definition: ${fromDef.name} (ID: ${fromDef.id})`);
      } else {
        console.log(`[AudioGraphConnectorService] From definition for instance ${fromInstance.instanceId} not found.`);
      }
      if (toDef) {
        console.log(`[AudioGraphConnectorService] To definition: ${toDef.name} (ID: ${toDef.id})`);
      } else {
        console.log(`[AudioGraphConnectorService] To definition for instance ${toInstance.instanceId} not found.`);
      }

      if (!fromDef || !toDef) return;

      const outputPortDef = fromDef.outputs.find(p => p.id === conn.fromOutputId);
      const inputPortDef = toDef.inputs.find(p => p.id === conn.toInputId);

      if (outputPortDef) {
        console.log(`[AudioGraphConnectorService] Output port: ${outputPortDef.id}, Type: ${outputPortDef.type}`);
      } else {
        console.log(`[AudioGraphConnectorService] Output port with ID ${conn.fromOutputId} not found in definition ${fromDef.id}.`);
      }
      if (inputPortDef) {
        console.log(`[AudioGraphConnectorService] Input port: ${inputPortDef.id}, Type: ${inputPortDef.type}`);
      } else {
        console.log(`[AudioGraphConnectorService] Input port with ID ${conn.toInputId} not found in definition ${toDef.id}.`);
      }

      if (!outputPortDef || !inputPortDef) return;

      if (outputPortDef.type === 'gate' || outputPortDef.type === 'trigger') {
        const sourceManagedNodeInfo = managedNativeNodes.get(fromInstance.instanceId);
        if (sourceManagedNodeInfo && (sourceManagedNodeInfo as any).providerInstance &&
          typeof ((sourceManagedNodeInfo as any).providerInstance as EmitterProvider).getEmitter === 'function') {
          const provider = (sourceManagedNodeInfo as any).providerInstance as EmitterProvider;
          const emitter = provider.getEmitter(conn.fromOutputId);

          if (emitter) {
            if (!toInstance.internalState) {
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
        return;
      } else if (outputPortDef.type === 'audio' && inputPortDef.type === 'audio') {
        console.log(`[AudioGraphConnectorService] Processing audio connection from ${fromDef.name} to ${toDef.name} (${conn.id})`);
        let sourceNode: ConnectableSource | undefined;
        const fromWorkletInfo = managedWorkletNodes.get(fromInstance.instanceId);
        const fromNativeInfo = managedNativeNodes.get(fromInstance.instanceId);
        const fromLyriaInfo = managedLyriaServices.get(fromInstance.instanceId);

        if (fromWorkletInfo) sourceNode = fromWorkletInfo.node;
        else if (fromNativeInfo) sourceNode = fromNativeInfo.nodeForOutputConnections as ConnectableSource | undefined;
        else if (fromLyriaInfo) sourceNode = fromLyriaInfo.outputNode as ConnectableSource | undefined;

        if (sourceNode) {
          console.log(`[AudioGraphConnectorService] Source node identified for ${fromInstance.instanceId}:`, sourceNode);
        } else {
          console.log(`[AudioGraphConnectorService] Source node NOT identified for ${fromInstance.instanceId}.`);
          return;
        }

        let targetNode: ConnectableTargetNode | undefined | null;
        let targetParam: ConnectableParam | undefined;

        const toWorkletInfo = managedWorkletNodes.get(toInstance.instanceId);
        const toNativeInfo = managedNativeNodes.get(toInstance.instanceId);

        if (inputPortDef.audioParamTarget) {
          if (toWorkletInfo?.node?.parameters?.has(inputPortDef.audioParamTarget)) {
            targetParam = toWorkletInfo.node.parameters.get(inputPortDef.audioParamTarget);
            targetNode = toWorkletInfo.node;
            console.log(`[AudioGraphConnectorService] Target param identified for ${toInstance.instanceId}: ${inputPortDef.audioParamTarget} on WorkletNode`, targetParam);
          } else if (toNativeInfo?.paramTargetsForCv?.has(inputPortDef.audioParamTarget)) {
            targetParam = toNativeInfo.paramTargetsForCv.get(inputPortDef.audioParamTarget);
            targetNode = (toNativeInfo.nodeForInputConnections || (toNativeInfo as any).toneOscillator || (toNativeInfo as any).toneGain || (toNativeInfo as any).toneFilter || (toNativeInfo as any).toneFeedbackDelay || (toNativeInfo as any).toneAmplitudeEnvelope) as ConnectableTargetNode | undefined;
            console.log(`[AudioGraphConnectorService] Target param identified for ${toInstance.instanceId}: ${inputPortDef.audioParamTarget} on NativeNode`, targetParam);
          }
        } else {
          if (toWorkletInfo) {
            targetNode = toWorkletInfo.node;
            console.log(`[AudioGraphConnectorService] Target node identified for ${toInstance.instanceId} (WorkletNode):`, targetNode);
          } else if (toNativeInfo) {
            targetNode = toNativeInfo.nodeForInputConnections as ConnectableTargetNode | undefined;
            console.log(`[AudioGraphConnectorService] Target node identified for ${toInstance.instanceId} (NativeNode):`, targetNode);
          }
        }

        if (!targetNode && !targetParam) {
          console.log(`[AudioGraphConnectorService] Target node or param NOT identified for ${toInstance.instanceId}.`);
          return;
        }

        // Ensure targetNode is set if targetParam is present (for logging and connection info)
        if (targetParam && !targetNode) {
          if (toNativeInfo) {
            targetNode = (toNativeInfo.nodeForInputConnections || (toNativeInfo as any).toneOscillator || (toNativeInfo as any).toneGain || (toNativeInfo as any).toneFilter || (toNativeInfo as any).toneFeedbackDelay || (toNativeInfo as any).toneAmplitudeEnvelope) as ConnectableTargetNode | undefined;
          } else if (toWorkletInfo) {
            targetNode = toWorkletInfo.node;
          }
           console.log(`[AudioGraphConnectorService] Target node resolved for param connection for ${toInstance.instanceId}:`, targetNode);
        }


        if (sourceNode && targetParam && targetNode) {
          try {
            (sourceNode as any).connect(targetParam as any);
            console.log(`[AudioGraphConnectorService] Successfully connected source ${fromInstance.instanceId} to target param ${inputPortDef.audioParamTarget} of ${toInstance.instanceId}. ID: ${conn.id}`);
            newActiveConnections.set(conn.id, { connectionId: conn.id, sourceNode: sourceNode, targetNode: targetNode, targetParam: targetParam });
          } catch (e) {
            console.error(`[AudioGraphConnectorService Conn] Error (Param) for ID ${conn.id}: ${(e as Error).message}. From: ${fromDef.name}, To: ${toDef.name} (Param: ${inputPortDef.audioParamTarget})`);
          }
        } else if (sourceNode && targetNode) {
          try {
            (sourceNode as any).connect(targetNode as any);
            console.log(`[AudioGraphConnectorService] Successfully connected source ${fromInstance.instanceId} to target node ${toInstance.instanceId}. ID: ${conn.id}`);
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
            console.warn(`[AudioGraphConnectorService] Error disconnecting old connection ${oldConnId}:`, e);
        }
      }
    });
    console.log(`[AudioGraphConnectorService] Finished updating connections. Active Web Audio Connections (${this.activeWebAudioConnections.size}):`, this.activeWebAudioConnections);
    this.activeWebAudioConnections = newActiveConnections;
    return instanceUpdates;
  }

  public disconnectAll(): void {
    console.log(`[AudioGraphConnectorService] disconnectAll called. Disconnecting ${this.activeWebAudioConnections.size} active web audio connections.`);
    this.activeWebAudioConnections.forEach((connInfo, connId) => {
      console.log(`[AudioGraphConnectorService] Disconnecting connection: ${connId}`, connInfo);
      try {
        if (connInfo.targetParam) {
          (connInfo.sourceNode as any).disconnect(connInfo.targetParam as any);
          console.log(`[AudioGraphConnectorService] Disconnected source from target param for ${connId}`);
        } else if (connInfo.targetNode) {
          (connInfo.sourceNode as any).disconnect(connInfo.targetNode as any);
          console.log(`[AudioGraphConnectorService] Disconnected source from target node for ${connId}`);
        }
      } catch (e) {
        console.warn(`[AudioGraphConnectorService] Error during disconnection of ${connId}:`, e);
      }
    });
    this.activeWebAudioConnections.clear();
    console.log('[AudioGraphConnectorService] All connections cleared.');
  }
}

export default AudioGraphConnectorService.getInstance();
