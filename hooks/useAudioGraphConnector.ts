import { useCallback, useRef } from 'react';
import { Connection, BlockInstance, BlockDefinition } from '../types';
import { ManagedWorkletNodeInfo } from './useAudioWorkletManager'; // Assuming these are exported or in types.ts
import { ManagedNativeNodeInfo } from './useNativeNodeManager';   // Assuming these are exported or in types.ts
import { ManagedLyriaServiceInfo } from './useLyriaServiceManager'; // Assuming these are exported or in types.ts
import { AUDIO_OUTPUT_BLOCK_DEFINITION, NATIVE_ALLPASS_FILTER_BLOCK_DEFINITION } from '../constants'; // For specific block checks

// Type moved from useAudioEngine.ts
export interface ActiveWebAudioConnection {
  connectionId: string;
  sourceNode: AudioNode;
  targetNode: AudioNode;
  targetParam?: AudioParam;
}

export interface AudioGraphConnector {
  updateAudioGraphConnections: (
    connections: Connection[],
    blockInstances: BlockInstance[],
    getDefinitionForBlock: (instance: BlockInstance) => BlockDefinition | undefined,
    managedWorkletNodes: Map<string, ManagedWorkletNodeInfo>,
    managedNativeNodes: Map<string, ManagedNativeNodeInfo>,
    managedLyriaServices: Map<string, ManagedLyriaServiceInfo>
  ) => void;
}

interface UseAudioGraphConnectorProps {
  appLog: (message: string, isSystem?: boolean) => void;
  // onStateChangeForReRender: () => void; // Removed
  audioContext: AudioContext | null;
  isAudioGloballyEnabled: boolean;
}

export const useAudioGraphConnector = ({
  appLog, // appLog is not used in the original updateAudioGraphConnections, but kept for consistency
  // onStateChangeForReRender, // Removed
  audioContext,
  isAudioGloballyEnabled,
}: UseAudioGraphConnectorProps): AudioGraphConnector => {
  const activeWebAudioConnectionsRef = useRef<Map<string, ActiveWebAudioConnection>>(new Map());

  const updateAudioGraphConnections = useCallback((
    connections: Connection[],
    blockInstances: BlockInstance[],
    getDefinitionForBlock: (instance: BlockInstance) => BlockDefinition | undefined,
    managedWorkletNodes: Map<string, ManagedWorkletNodeInfo>,
    managedNativeNodes: Map<string, ManagedNativeNodeInfo>,
    managedLyriaServices: Map<string, ManagedLyriaServiceInfo>
  ) => {
    if (!audioContext || !isAudioGloballyEnabled || audioContext.state !== 'running') {
      activeWebAudioConnectionsRef.current.forEach(connInfo => {
        try {
          if (connInfo.targetParam) connInfo.sourceNode.disconnect(connInfo.targetParam);
          else connInfo.sourceNode.disconnect(connInfo.targetNode);
        } catch (e) { /* ignore */ }
      });
      activeWebAudioConnectionsRef.current.clear();
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

      let targetAudioNodeOrParam: AudioNode | AudioParam | undefined;
      const toWorkletInfo = managedWorkletNodes.get(toInstance.instanceId);
      const toNativeInfo = managedNativeNodes.get(toInstance.instanceId);

      if (inputPortDef.audioParamTarget) {
        if (toWorkletInfo && toWorkletInfo.node.parameters.has(inputPortDef.audioParamTarget)) {
          targetAudioNodeOrParam = toWorkletInfo.node.parameters.get(inputPortDef.audioParamTarget);
        } else if (toNativeInfo && toNativeInfo.paramTargetsForCv?.has(inputPortDef.audioParamTarget)) {
          targetAudioNodeOrParam = toNativeInfo.paramTargetsForCv.get(inputPortDef.audioParamTarget);
        } else if (toNativeInfo && toNativeInfo.allpassInternalNodes && inputPortDef.audioParamTarget === 'delayTime') {
            targetAudioNodeOrParam = toNativeInfo.allpassInternalNodes.inputDelay.delayTime;
        } else if (toNativeInfo && toNativeInfo.allpassInternalNodes && inputPortDef.audioParamTarget === 'coefficient') {
            targetAudioNodeOrParam = toNativeInfo.allpassInternalNodes.feedbackGain.gain;
        }
      } else {
        if (toWorkletInfo) {
            targetAudioNodeOrParam = (toDef.id === AUDIO_OUTPUT_BLOCK_DEFINITION.id && toWorkletInfo.inputGainNode)
                ? toWorkletInfo.inputGainNode
                : toWorkletInfo.node;
        } else if (toNativeInfo) {
            if (toDef.id === NATIVE_ALLPASS_FILTER_BLOCK_DEFINITION.id && toNativeInfo.allpassInternalNodes) {
                if (sourceAudioNode && toNativeInfo.allpassInternalNodes.inputGain1 && toNativeInfo.allpassInternalNodes.inputPassthroughNode) {
                    try {
                        sourceAudioNode.connect(toNativeInfo.allpassInternalNodes.inputGain1);
                        newActiveConnections.set(`${conn.id}-path1`, { connectionId: conn.id, sourceNode: sourceAudioNode, targetNode: toNativeInfo.allpassInternalNodes.inputGain1 });
                        sourceAudioNode.connect(toNativeInfo.allpassInternalNodes.inputPassthroughNode);
                        newActiveConnections.set(`${conn.id}-path2`, { connectionId: conn.id, sourceNode: sourceAudioNode, targetNode: toNativeInfo.allpassInternalNodes.inputPassthroughNode });
                    } catch (e) { console.error(`[AudioGraphConnector Conn] Error connecting to Allpass internal for ${conn.id}: ${(e as Error).message}`); }
                    targetAudioNodeOrParam = null; // Connection handled
                }
            } else {
                 targetAudioNodeOrParam = toNativeInfo.nodeForInputConnections;
            }
        }
      }

      if (sourceAudioNode && targetAudioNodeOrParam) {
        try {
          if (targetAudioNodeOrParam instanceof AudioParam) {
            sourceAudioNode.connect(targetAudioNodeOrParam);
            newActiveConnections.set(conn.id, { connectionId: conn.id, sourceNode: sourceAudioNode, targetNode: (targetAudioNodeOrParam as any).node || targetAudioNodeOrParam, targetParam: targetAudioNodeOrParam });
          } else {
            sourceAudioNode.connect(targetAudioNodeOrParam);
            newActiveConnections.set(conn.id, { connectionId: conn.id, sourceNode: sourceAudioNode, targetNode: targetAudioNodeOrParam });
          }
        } catch (e) {
          console.error(`[AudioGraphConnector Conn] Error for ID ${conn.id}: ${(e as Error).message}. From: ${fromDef.name}, To: ${toDef.name}`);
        }
      } else if (sourceAudioNode && targetAudioNodeOrParam === null && toDef.id === NATIVE_ALLPASS_FILTER_BLOCK_DEFINITION.id) {
          // Allpass connection handled above, do nothing here.
      }
    });

    activeWebAudioConnectionsRef.current.forEach((oldConnInfo, oldConnId) => {
      if (!newActiveConnections.has(oldConnId)) {
        try {
          if (oldConnInfo.targetParam) oldConnInfo.sourceNode.disconnect(oldConnInfo.targetParam);
          else oldConnInfo.sourceNode.disconnect(oldConnInfo.targetNode);
        } catch (e) { /* ignore */ }
      }
    });
    activeWebAudioConnectionsRef.current = newActiveConnections;
    // onStateChangeForReRender(); // Removed
  }, [audioContext, isAudioGloballyEnabled]); // onStateChangeForReRender removed from dependencies
  // appLog removed from dependencies as it's not used internally by this specific function

  return {
    updateAudioGraphConnections,
  };
};
