/**
 * This service is responsible for executing the user-defined JavaScript logic associated with each non-audio-rate block in the application's graph.
 * It orchestrates the flow of data between blocks by first determining the correct execution order using a topological sort of the block connections.
 * For each block, it compiles (and caches) its `logicCode` into a function, then executes it with the necessary inputs, parameters, internal state, and callbacks to interact with the wider system (like setting outputs or logging).
 * The service runs a processing loop at a regular interval (e.g., every 10ms) to update block states, manage interactions with the `AudioEngine` for certain block types (like triggering envelopes), and ensures that changes are propagated through the graph.
 * It effectively provides the runtime environment for the control-rate logic that drives the dynamic behavior of the audio application.
 */
import { BlockInstance, Connection, BlockDefinition } from '../types';
import { BlockStateManager, getDefaultOutputValue } from '../state/BlockStateManager';
import { AudioEngineService } from './AudioEngineService';
import {
    NATIVE_AD_ENVELOPE_BLOCK_DEFINITION,
    NATIVE_AR_ENVELOPE_BLOCK_DEFINITION,
    NUMBER_TO_CONSTANT_AUDIO_BLOCK_DEFINITION,
    LYRIA_MASTER_BLOCK_DEFINITION,
} from '../constants';

// Helper function, can be static or outside the class
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
    // console.warn("Cycle detected in block graph or disconnected nodes. Execution order may be incomplete. Missing:", missingNodes);
    return [...sortedOrder, ...missingNodes];
  }

  return sortedOrder;
}

export class LogicExecutionService {
  private blockStateManager: BlockStateManager;
  private getDefinitionForBlock: (instance: BlockInstance) => BlockDefinition | undefined;
  private audioEngine: AudioEngineService | null = null;

  private currentBlockInstances: BlockInstance[] = [];
  private currentConnections: Connection[] = [];
  private currentGlobalBpm: number = 120;
  private currentIsAudioGloballyEnabled: boolean = false;

  private runIntervalId: number | null = null;
  private currentTickOutputs: Record<string, Record<string, any>> = {};

  // Cache for compiled logic functions
  private logicFunctionCache: Map<string, Function> = new Map();

  // --- Comparison Helper Methods ---

  private areShallowObjectsDifferent(obj1: Record<string, any> | null | undefined, obj2: Record<string, any> | null | undefined): boolean {
    if (obj1 === obj2) return false; // Same reference or both null/undefined
    if (!obj1 || !obj2) return true; // One is null/undefined, the other isn't

    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) return true;

    for (const key of keys1) {
      if (!obj2.hasOwnProperty(key)) return true; // Key in obj1 but not in obj2

      const val1 = obj1[key];
      const val2 = obj2[key];

      if (Array.isArray(val1) && Array.isArray(val2)) {
        if (val1.length !== val2.length) return true;
        for (let i = 0; i < val1.length; i++) {
          if (val1[i] !== val2[i]) return true;
        }
      } else if (typeof val1 === 'object' && val1 !== null && typeof val2 === 'object' && val2 !== null) {
        // For nested objects, this shallow compare will check reference.
        // If actual deep value comparison is needed for some sub-objects, this needs enhancement.
        if (val1 !== val2) return true;
      } else {
        if (val1 !== val2) return true;
      }
    }
    return false;
  }

  private areOutputsDifferent(prevOutputs: Record<string, any> | null | undefined, newOutputs: Record<string, any> | null | undefined): boolean {
    // Outputs are generally simple value types or arrays of simple types.
    return this.areShallowObjectsDifferent(prevOutputs, newOutputs);
  }

  private areInternalStatesDifferent(prevState: Record<string, any> | null | undefined, newState: Record<string, any> | null | undefined): boolean {
    // Internal state can be more complex, but we'll start with shallow.
    // Specific complex properties might need custom handling or deeper comparison if this proves insufficient.
    return this.areShallowObjectsDifferent(prevState, newState);
  }


  constructor(
    blockStateManager: BlockStateManager,
    getDefinitionForBlock: (instance: BlockInstance) => BlockDefinition | undefined,
    initialAudioEngine: AudioEngineService | null
  ) {
    this.blockStateManager = blockStateManager;
    this.getDefinitionForBlock = getDefinitionForBlock;
    this.audioEngine = initialAudioEngine;
    console.log('[LogicExecutionService] Initialized');
  }

  public updateDependencies(
    blockInstances: BlockInstance[],
    connections: Connection[],
    globalBpm: number,
    isAudioGloballyEnabled: boolean,
    audioEngine: AudioEngineService | null
  ): void {
    this.currentIsAudioGloballyEnabled = isAudioGloballyEnabled; // Update state first
    this.currentBlockInstances = blockInstances;
    this.currentConnections = connections;
    this.currentGlobalBpm = globalBpm;
    this.audioEngine = audioEngine;

    // If audio was disabled and is now enabled, and processing isn't running, start it.
    if (isAudioGloballyEnabled && !this.runIntervalId) { // Simpler condition: if it's enabled and not running, start
        this.startProcessingLoop();
    }
    // If audio was enabled and is now disabled, and processing is running, stop it.
    else if (!isAudioGloballyEnabled && this.runIntervalId !== null) { // Simpler: if it's disabled and running, stop
        this.stopProcessingLoop();
    }
  }

  private compileLogicFunction(instanceId: string, logicCode: string): Function {
    if (this.logicFunctionCache.has(instanceId)) {
      // Potentially add a check if logicCode has changed to recompile,
      // but for now, assume logicCode per instanceId is stable or managed externally.
      // If block definitions can change at runtime, this cache would need invalidation.
      return this.logicFunctionCache.get(instanceId)!;
    }
    const compiledFunction = new Function(
        'inputs',
        'params',
        'internalState',
        'setOutput',
        '__custom_block_logger__',
        'audioContextInfo',
        'postMessageToWorklet'
    , logicCode);
    this.logicFunctionCache.set(instanceId, compiledFunction);
    return compiledFunction;
  }

  // New method to prepare updates for a single instance
  private prepareInstanceUpdate(
    instance: BlockInstance,
    audioContextInfo: { sampleRate: number; bpm: number }
  ): { instanceId: string; updates: Partial<BlockInstance> } | null {
    const definition = this.getDefinitionForBlock(instance);
    if (!definition) {
      // Error handling: prepare an update that sets the error state
      this.blockStateManager.addLogToBlockInstance(instance.instanceId, `Error: Definition ${instance.definitionId} not found.`); // Added log
      return {
        instanceId: instance.instanceId,
        updates: { error: `Definition ${instance.definitionId} not found.` }
      };
    }

    if (definition.id === LYRIA_MASTER_BLOCK_DEFINITION.id) {
        return null;
    }

    const inputValuesForLogic: Record<string, any> = {};
    // ... (logic for inputValuesForLogic as in current handleRunInstance)
    definition.inputs.forEach(inputPort => {
      const conn = this.currentConnections.find(c => c.toInstanceId === instance.instanceId && c.toInputId === inputPort.id);
      if (conn) {
        const sourceInstanceOutputs = this.currentTickOutputs[conn.fromInstanceId];
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
    instance.parameters.forEach(param => parameterValuesForLogic[param.id] = param.currentValue);

    try {
      const mainLogicFunction = this.compileLogicFunction(instance.instanceId, definition.logicCode);
      let outputsFromLogic: Record<string, any> = {};
      const setOutputInLogic = (outputId: string, value: any) => { outputsFromLogic[outputId] = value; };
      const loggerInLogic = (message: string) => {
        // This logger call still needs to happen immediately or be batched in a different way.
        // For now, let it call directly, as logs aren't usually performance critical in the same way as state updates.
        this.blockStateManager.addLogToBlockInstance(instance.instanceId, message);
      };
      const postMessageToWorkletInLogic = this.audioEngine
          ? (message: any) => this.audioEngine?.sendManagedAudioWorkletNodeMessage(instance.instanceId, message)
          : () => console.warn(`[LogicExecutionService] Attempted to post message to worklet for ${instance.instanceId} but audioEngine is null`);

      const nextInternalStateOpaque = mainLogicFunction(
        inputValuesForLogic, parameterValuesForLogic,
        { ...(instance.internalState || {}), lastTriggerStateBeforeCurrentLogicPass: instance.internalState?.lastTriggerState },
        setOutputInLogic, loggerInLogic, audioContextInfo, postMessageToWorkletInLogic
      );

      const finalOutputsForTick: Record<string, any> = {};
      definition.outputs.forEach(outPort => {
        finalOutputsForTick[outPort.id] = outputsFromLogic[outPort.id] !== undefined ? outputsFromLogic[outPort.id] : getDefaultOutputValue(outPort.type);
      });
      this.currentTickOutputs[instance.instanceId] = finalOutputsForTick;

      let newInternalState = { ...(instance.internalState || {}), ...nextInternalStateOpaque };

      // ... (audioEngine calls like triggerNativeNodeEnvelope as in current handleRunInstance) ...
      if (this.audioEngine) {
        if (definition.id === NATIVE_AD_ENVELOPE_BLOCK_DEFINITION.id && newInternalState.envelopeNeedsTriggering) {
          const attackParam = instance.parameters.find(p => p.id === 'attackTime');
          const decayParam = instance.parameters.find(p => p.id === 'decayTime');
          const peakLevelParam = instance.parameters.find(p => p.id === 'peakLevel');
          if (attackParam && decayParam && peakLevelParam) {
            this.audioEngine.triggerNativeNodeEnvelope?.(
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
              this.audioEngine.triggerNativeNodeAttackHold?.(
                  instance.instanceId,
                  Number(attackParam.currentValue),
                  Number(sustainLevelParam.currentValue)
              );
            }
            newInternalState.gateStateChangedToHigh = false;
          } else if (newInternalState.gateStateChangedToLow) {
            const releaseParam = instance.parameters.find(p => p.id === 'releaseTime');
            if (releaseParam) {
              this.audioEngine.triggerNativeNodeRelease?.(instance.instanceId, Number(releaseParam.currentValue));
            }
            newInternalState.gateStateChangedToLow = false;
          }
        }
        if (definition.id.startsWith('native-') && !instance.internalState.needsAudioNodeSetup && this.audioEngine.audioContext) {
             if (definition.id === NUMBER_TO_CONSTANT_AUDIO_BLOCK_DEFINITION.id) {
                 this.audioEngine.updateManagedNativeNodeParams?.(
                    instance.instanceId,
                    instance.parameters,
                    inputValuesForLogic,
                    this.currentGlobalBpm
                );
            }
        }
      }


          return {
            instanceId: instance.instanceId,
            updates: {
        internalState: newInternalState,
        lastRunOutputs: finalOutputsForTick,
        error: null,
            }
          };

        } catch (e: any) {
          const errorMsg = `Runtime error in '${instance.name}': ${e.message}`;
          this.blockStateManager.addLogToBlockInstance(instance.instanceId, errorMsg); // Log immediately
          return {
            instanceId: instance.instanceId,
            updates: { error: errorMsg, lastRunOutputs: {} }
          };
  }
      }

      // Remove or comment out the old handleRunInstance method
      // private handleRunInstance(instance: BlockInstance, audioContextInfo: { sampleRate: number, bpm: number }): void { ... }

      private runInstancesLoop(): void {
        if (!this.audioEngine || !this.currentIsAudioGloballyEnabled) {
          this.stopProcessingLoop();
          return;
        }

        const orderedInstanceIds = determineExecutionOrder(this.currentBlockInstances, this.currentConnections);
        const sampleRate = this.audioEngine.getSampleRate();
        const audioContextInfo = {
          sampleRate: sampleRate || 44100,
          bpm: this.currentGlobalBpm,
        };

        const validInstanceIds = new Set(this.currentBlockInstances.map(b => b.instanceId));
        for (const instId in this.currentTickOutputs) {
            if (!validInstanceIds.has(instId)) {
                delete this.currentTickOutputs[instId];
            }
        }

        this.currentBlockInstances.forEach(instance => {
            if (!this.currentTickOutputs[instance.instanceId]) {
                this.currentTickOutputs[instance.instanceId] = { ...instance.lastRunOutputs };
            }
        });

        const instanceUpdates: Array<{ instanceId: string; updates: Partial<BlockInstance> | ((prev: BlockInstance) => BlockInstance) }> = [];

        for (const instanceId of orderedInstanceIds) {
          const instance = this.currentBlockInstances.find(b => b.instanceId === instanceId);
          if (instance) {
            if (!this.currentTickOutputs[instance.instanceId]) {
                this.currentTickOutputs[instance.instanceId] = { ...instance.lastRunOutputs };
            }

            const updatePayload = this.prepareInstanceUpdate(instance, audioContextInfo); // New method
            if (updatePayload) {
                let significantChange = false;

                // 1. Check for error state change
                if ((instance.error || null) !== (updatePayload.updates.error || null)) {
                    significantChange = true;
                }

                // 2. Check for output changes (if no error change detected yet)
                // Ensure `lastRunOutputs` exists on `updatePayload.updates` before comparing.
                // `prepareInstanceUpdate` should always provide it if no error, or empty if error.
                if (!significantChange) {
                    if (this.areOutputsDifferent(instance.lastRunOutputs, updatePayload.updates.lastRunOutputs)) {
                        significantChange = true;
                    }
                }

                // 3. Check for internal state changes (if no other change detected yet)
                // Ensure `internalState` exists on `updatePayload.updates` before comparing.
                if (!significantChange) {
                    if (this.areInternalStatesDifferent(instance.internalState, updatePayload.updates.internalState)) {
                        significantChange = true;
                    }
                }

                if (significantChange) {
                    instanceUpdates.push(updatePayload);
                }
      }
          } else {
            console.warn(`[LogicExecutionService] Instance ${instanceId} not found during execution loop.`);
    }
  }

        if (instanceUpdates.length > 0) {
          this.blockStateManager.updateMultipleBlockInstances(instanceUpdates); // New method in BlockStateManager
        }
      }

      public startProcessingLoop(): void {
    if (this.runIntervalId === null && this.currentIsAudioGloballyEnabled) {
      this.currentTickOutputs = {}; // Clear outputs from previous runs
      // Initialize currentTickOutputs with lastRunOutputs for all current instances
      this.currentBlockInstances.forEach(instance => {
        this.currentTickOutputs[instance.instanceId] = { ...instance.lastRunOutputs };
      });
      this.runIntervalId = window.setInterval(() => this.runInstancesLoop(), 10);
      console.log('[LogicExecutionService] Logic processing loop STARTED.');
    } else if (!this.currentIsAudioGloballyEnabled) {
        console.log('[LogicExecutionService] Did not start logic processing loop because audio is not globally enabled.');
    }
  }

  public stopProcessingLoop(): void {
    if (this.runIntervalId !== null) {
      clearInterval(this.runIntervalId);
      this.runIntervalId = null;
      console.log('[LogicExecutionService] Logic processing loop STOPPED.');
    }
  }

  public clearLogicFunctionCache(): void {
    this.logicFunctionCache.clear();
    console.log('[LogicExecutionService] Logic function cache cleared.');
  }

  public clearBlockFromCache(instanceId: string): void {
    if (this.logicFunctionCache.has(instanceId)) {
        this.logicFunctionCache.delete(instanceId);
        console.log(`[LogicExecutionService] Cleared logic function for instance ${instanceId} from cache.`);
    }
  }
}
