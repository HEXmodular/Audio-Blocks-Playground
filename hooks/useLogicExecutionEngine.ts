
import { useCallback, useEffect, useRef } from 'react';
import { BlockInstance, Connection, BlockDefinition } from '../types';
import { BlockStateManager, getDefaultOutputValue } from '../state/BlockStateManager';
import { AudioEngine } from './useAudioEngine';
import {
    NATIVE_AD_ENVELOPE_BLOCK_DEFINITION,
    NATIVE_AR_ENVELOPE_BLOCK_DEFINITION,
    NUMBER_TO_CONSTANT_AUDIO_BLOCK_DEFINITION,
    LYRIA_MASTER_BLOCK_DEFINITION,
} from '../constants';

function determineExecutionOrder(instances: BlockInstance[], connections: Connection[]): string[] {
  const graph = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  const instanceIds = instances.map(inst => inst.instanceId);

  for (const id of instanceIds) {
    graph.set(id, []);
    inDegree.set(id, 0);
  }

  for (const conn of connections) {
    if (instanceIds.includes(conn.fromInstanceId) && instanceIds.includes(conn.toInstanceId)) {
      if (conn.fromInstanceId !== conn.toInstanceId) { // Prevent self-loops from breaking sort
        graph.get(conn.fromInstanceId)!.push(conn.toInstanceId);
        inDegree.set(conn.toInstanceId, (inDegree.get(conn.toInstanceId) || 0) + 1);
      }
    }
  }

  const queue: string[] = [];
  for (const id of instanceIds) {
    if (inDegree.get(id) === 0) {
      queue.push(id);
    }
  }

  const sortedOrder: string[] = [];
  while (queue.length > 0) {
    const u = queue.shift()!;
    sortedOrder.push(u);
    for (const v of graph.get(u) || []) {
      inDegree.set(v, (inDegree.get(v) || 0) - 1);
      if (inDegree.get(v) === 0) {
        queue.push(v);
      }
    }
  }

  if (sortedOrder.length !== instances.length) {
    const missingNodes = instanceIds.filter(id => !sortedOrder.includes(id));
    console.warn("Cycle detected in block graph or disconnected nodes. Execution order may be incomplete. Missing:", missingNodes);
    // Append missing nodes to attempt execution, though their inputs might be undefined
    return [...sortedOrder, ...missingNodes];
  }

  return sortedOrder;
}


export function useLogicExecutionEngine(
  appBlockInstances: BlockInstance[],
  connections: Connection[],
  getDefinitionForBlock: (instance: BlockInstance) => BlockDefinition | undefined,
  blockStateManager: BlockStateManager,
  audioEngine: AudioEngine | null,
  globalBpm: number,
  isAudioGloballyEnabled: boolean
) {
  const handleRunInstance = useCallback((instance: BlockInstance, currentTickOutputs: Record<string, Record<string, any>>, audioContextInfo: { sampleRate: number, bpm: number }) => {
    const definition = getDefinitionForBlock(instance);
    if (!definition) {
      blockStateManager.addLogToBlockInstance(instance.instanceId, `Error: Definition ${instance.definitionId} not found.`);
      blockStateManager.updateBlockInstance(instance.instanceId, { error: `Definition ${instance.definitionId} not found.` });
      return;
    }

    if (definition.id === LYRIA_MASTER_BLOCK_DEFINITION.id) {
        // Lyria Master block updates are handled by a separate effect hook in App.tsx
        // Its internal state is primarily reactive to service events and param/input changes managed by App.tsx
        // It doesn't have a "logicCode" to execute in the same way other blocks do.
        return;
    }

    const inputValuesForLogic: Record<string, any> = {};
    definition.inputs.forEach(inputPort => {
      const conn = connections.find(c => c.toInstanceId === instance.instanceId && c.toInputId === inputPort.id);
      if (conn) {
        const sourceInstanceOutputs = currentTickOutputs[conn.fromInstanceId];
        if (sourceInstanceOutputs && sourceInstanceOutputs[conn.fromOutputId] !== undefined) {
          inputValuesForLogic[inputPort.id] = sourceInstanceOutputs[conn.fromOutputId];
        } else {
          inputValuesForLogic[inputPort.id] = getDefaultOutputValue(inputPort.type);
        }
      } else {
        inputValuesForLogic[inputPort.id] = getDefaultOutputValue(inputPort.type);
      }
    });

    const parameterValuesForLogic: Record<string, any> = {};
    instance.parameters.forEach(param => {
      parameterValuesForLogic[param.id] = param.currentValue;
    });

    try {
      const mainLogicFunction = new Function('inputs', 'params', 'internalState', 'setOutput', '__custom_block_logger__', 'audioContextInfo', 'postMessageToWorklet', definition.logicCode);

      let outputsFromLogic: Record<string, any> = {};
      const setOutputInLogic = (outputId: string, value: any) => { outputsFromLogic[outputId] = value; };
      const loggerInLogic = (message: string) => blockStateManager.addLogToBlockInstance(instance.instanceId, message);
      const postMessageToWorkletInLogic = (message: any) => audioEngine?.sendManagedAudioWorkletNodeMessage(instance.instanceId, message);

      const nextInternalStateOpaque = mainLogicFunction(
        inputValuesForLogic,
        parameterValuesForLogic,
        { ...(instance.internalState || {}), lastTriggerStateBeforeCurrentLogicPass: instance.internalState?.lastTriggerState }, 
        setOutputInLogic,
        loggerInLogic,
        audioContextInfo,
        postMessageToWorkletInLogic
      );

      const finalOutputsForTick: Record<string, any> = {};
      definition.outputs.forEach(outPort => {
        finalOutputsForTick[outPort.id] = outputsFromLogic[outPort.id] !== undefined ? outputsFromLogic[outPort.id] : getDefaultOutputValue(outPort.type);
      });
      currentTickOutputs[instance.instanceId] = finalOutputsForTick;

      let newInternalState = { ...(instance.internalState || {}), ...nextInternalStateOpaque };

      if (definition.id === NATIVE_AD_ENVELOPE_BLOCK_DEFINITION.id && newInternalState.envelopeNeedsTriggering) {
        const attackParam = instance.parameters.find(p => p.id === 'attackTime');
        const decayParam = instance.parameters.find(p => p.id === 'decayTime');
        const peakLevelParam = instance.parameters.find(p => p.id === 'peakLevel');
        if (attackParam && decayParam && peakLevelParam) {
           audioEngine?.triggerNativeNodeEnvelope(
            instance.instanceId,
            Number(attackParam.currentValue),
            Number(decayParam.currentValue),
            Number(peakLevelParam.currentValue)
          );
        }
        newInternalState.envelopeNeedsTriggering = false; 
      } else if (definition.id === NATIVE_AR_ENVELOPE_BLOCK_DEFINITION.id) {
        if (newInternalState.gateStateChangedToHigh) {
          const attackParam = instance.parameters.find(p => p.id === 'attackTime');
          const sustainLevelParam = instance.parameters.find(p => p.id === 'sustainLevel');
          if (attackParam && sustainLevelParam) {
            audioEngine?.triggerNativeNodeAttackHold(
                instance.instanceId,
                Number(attackParam.currentValue),
                Number(sustainLevelParam.currentValue)
            );
          }
          newInternalState.gateStateChangedToHigh = false; 
        } else if (newInternalState.gateStateChangedToLow) {
          const releaseParam = instance.parameters.find(p => p.id === 'releaseTime');
          if (releaseParam) {
            audioEngine?.triggerNativeNodeRelease(instance.instanceId, Number(releaseParam.currentValue));
          }
          newInternalState.gateStateChangedToLow = false; 
        }
      }

      if (audioEngine && definition.id.startsWith('native-') && !instance.internalState.needsAudioNodeSetup && audioEngine.audioContext) {
        if (definition.id === NUMBER_TO_CONSTANT_AUDIO_BLOCK_DEFINITION.id) {
            audioEngine.updateManagedNativeNodeParams(
                instance.instanceId,
                instance.parameters,
                inputValuesForLogic, 
                globalBpm
            );
        }
      }


      blockStateManager.updateBlockInstance(instance.instanceId, currentInstance => ({
        ...currentInstance,
        internalState: newInternalState,
        lastRunOutputs: finalOutputsForTick,
        error: null, 
      }));

    } catch (e: any) {
      const errorMsg = `Runtime error in '${instance.name}': ${e.message}`;
      blockStateManager.addLogToBlockInstance(instance.instanceId, errorMsg);
      blockStateManager.updateBlockInstance(instance.instanceId, { error: errorMsg, lastRunOutputs: {} });
      currentTickOutputs[instance.instanceId] = {}; 
    }
  }, [getDefinitionForBlock, connections, blockStateManager, audioEngine, globalBpm]);

  const runInstancesInOrder = useCallback(() => {
    if (!audioEngine) return;
    const orderedInstanceIds = determineExecutionOrder(appBlockInstances, connections);
    const currentTickOutputs: Record<string, Record<string, any>> = {};
    const sampleRate = audioEngine.getSampleRate();

    const audioContextInfo = {
      sampleRate: sampleRate || 44100, 
      bpm: globalBpm,
    };

    for (const instanceId of orderedInstanceIds) {
      const instance = appBlockInstances.find(b => b.instanceId === instanceId);
      if (instance) {
        if (!currentTickOutputs[instance.instanceId]) {
            currentTickOutputs[instance.instanceId] = { ...instance.lastRunOutputs };
        }
        handleRunInstance(instance, currentTickOutputs, audioContextInfo);
      }
    }
  }, [appBlockInstances, connections, handleRunInstance, audioEngine, globalBpm]);

  const runIntervalRef = useRef<number | null>(null);
  useEffect(() => {
    if (isAudioGloballyEnabled && audioEngine) {
      if (runIntervalRef.current === null) {
        runIntervalRef.current = window.setInterval(runInstancesInOrder, 10); 
        console.log("[System] Logic processing loop started (10ms interval).");
      }
    } else {
      if (runIntervalRef.current !== null) {
        clearInterval(runIntervalRef.current);
        runIntervalRef.current = null;
        console.log("[System] Logic processing loop stopped.");
      }
    }
    return () => {
      if (runIntervalRef.current !== null) clearInterval(runIntervalRef.current);
    };
  }, [isAudioGloballyEnabled, runInstancesInOrder, audioEngine]);

}
