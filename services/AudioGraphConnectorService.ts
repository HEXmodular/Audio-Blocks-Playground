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

    console.log("[AudioGraphConnectorService] Updating connections. Current active connections: ", connections);

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

        if (!sourceNode) return;

        let targetNode: ConnectableTargetNode | undefined | null;
        let targetParam: ConnectableParam | undefined;

        const toWorkletInfo = managedWorkletNodes.get(toInstance.instanceId);
        const toNativeInfo = managedNativeNodes.get(toInstance.instanceId);

        if (inputPortDef.audioParamTarget) {
          if (toWorkletInfo?.node?.parameters?.has(inputPortDef.audioParamTarget)) {
            targetParam = toWorkletInfo.node.parameters.get(inputPortDef.audioParamTarget);
            targetNode = toWorkletInfo.node;
          } else if (toNativeInfo?.paramTargetsForCv?.has(inputPortDef.audioParamTarget)) {
            targetParam = toNativeInfo.paramTargetsForCv.get(inputPortDef.audioParamTarget);
            targetNode = (toNativeInfo.nodeForInputConnections || (toNativeInfo as any).toneOscillator || (toNativeInfo as any).toneGain || (toNativeInfo as any).toneFilter || (toNativeInfo as any).toneFeedbackDelay || (toNativeInfo as any).toneAmplitudeEnvelope) as ConnectableTargetNode | undefined;
          }
        } else {
          if (toWorkletInfo) {
            targetNode = toWorkletInfo.node;
          } else if (toNativeInfo) {
            targetNode = toNativeInfo.nodeForInputConnections as ConnectableTargetNode | undefined;
          }
        }

        if (!targetNode && !targetParam) return;

        if (targetParam && !targetNode && toNativeInfo) {
          targetNode = (toNativeInfo.nodeForInputConnections || (toNativeInfo as any).toneOscillator || (toNativeInfo as any).toneGain || (toNativeInfo as any).toneFilter || (toNativeInfo as any).toneFeedbackDelay || (toNativeInfo as any).toneAmplitudeEnvelope) as ConnectableTargetNode | undefined;
        }
        if (targetParam && !targetNode && toWorkletInfo) {
          targetNode = toWorkletInfo.node;
        }

        if (sourceNode && targetParam && targetNode) {
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
        } catch (e) { }
      }
    });
    console.log(`[AudioGraphConnectorService] Updated connections. Active connections:`, newActiveConnections);
    this.activeWebAudioConnections = newActiveConnections;
    return instanceUpdates;
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
      } catch (e) { }
    });
    this.activeWebAudioConnections.clear();
  }
}

export default AudioGraphConnectorService.getInstance();
