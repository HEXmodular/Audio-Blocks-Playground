import { BlockInstance, Connection, BlockDefinition } from '../types';
import { BlockStateManager, getDefaultOutputValue } from '../state/BlockStateManager';
import { AudioEngine }  from '../hooks/useAudioEngine'; // Assuming AudioEngine is exported or use its path
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
    // This logging should be handled by the appLog passed to the service
    // console.warn("Cycle detected in block graph or disconnected nodes. Execution order may be incomplete. Missing:", missingNodes);
    return [...sortedOrder, ...missingNodes];
  }

  return sortedOrder;
}

export class LogicExecutionService {
  private blockStateManager: BlockStateManager;
  private getDefinitionForBlock: (instance: BlockInstance) => BlockDefinition | undefined;
  private audioEngine: AudioEngine | null = null;

  private currentBlockInstances: BlockInstance[] = [];
  private currentConnections: Connection[] = [];
  private currentGlobalBpm: number = 120;
  private currentIsAudioGloballyEnabled: boolean = false;

  private runIntervalId: number | null = null;
  private currentTickOutputs: Record<string, Record<string, any>> = {};

  // Cache for compiled logic functions
  private logicFunctionCache: Map<string, Function> = new Map();

  constructor(
    blockStateManager: BlockStateManager,
    getDefinitionForBlock: (instance: BlockInstance) => BlockDefinition | undefined,
    initialAudioEngine: AudioEngine | null
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
    audioEngine: AudioEngine | null
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

  private handleRunInstance(instance: BlockInstance, audioContextInfo: { sampleRate: number, bpm: number }): void {
    const definition = this.getDefinitionForBlock(instance);
    if (!definition) {
      this.blockStateManager.addLogToBlockInstance(instance.instanceId, `Error: Definition ${instance.definitionId} not found.`);
      this.blockStateManager.updateBlockInstance(instance.instanceId, { error: `Definition ${instance.definitionId} not found.` });
      return;
    }

    if (definition.id === LYRIA_MASTER_BLOCK_DEFINITION.id) {
        return; // Handled by App.tsx effects
    }

    const inputValuesForLogic: Record<string, any> = {};
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
      const loggerInLogic = (message: string) => this.blockStateManager.addLogToBlockInstance(instance.instanceId, message);
      // Ensure audioEngine is available before trying to access its methods
      const postMessageToWorkletInLogic = this.audioEngine
          ? (message: any) => this.audioEngine?.sendManagedAudioWorkletNodeMessage(instance.instanceId, message)
          : () => console.warn(`[LogicExecutionService] Attempted to post message to worklet for ${instance.instanceId} but audioEngine is null`);


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
      this.currentTickOutputs[instance.instanceId] = finalOutputsForTick;

      let newInternalState = { ...(instance.internalState || {}), ...nextInternalStateOpaque };

      if (this.audioEngine) { // Check if audioEngine is available
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


      this.blockStateManager.updateBlockInstance(instance.instanceId, currentInstance => ({
        ...currentInstance,
        internalState: newInternalState,
        lastRunOutputs: finalOutputsForTick,
        error: null,
      }));

    } catch (e: any) {
      const errorMsg = `Runtime error in '${instance.name}': ${e.message}`;
      this.blockStateManager.addLogToBlockInstance(instance.instanceId, errorMsg);
      this.blockStateManager.updateBlockInstance(instance.instanceId, { error: errorMsg, lastRunOutputs: {} });
      this.currentTickOutputs[instance.instanceId] = {};
    }
  }

  private runInstancesLoop(): void {
    if (!this.audioEngine || !this.currentIsAudioGloballyEnabled) {
      this.stopProcessingLoop(); // Stop if audio is disabled or engine is not available
      return;
    }

    const orderedInstanceIds = determineExecutionOrder(this.currentBlockInstances, this.currentConnections);
    const sampleRate = this.audioEngine.getSampleRate();
    const audioContextInfo = {
      sampleRate: sampleRate || 44100,
      bpm: this.currentGlobalBpm,
    };

    // Reset/clear currentTickOutputs for instances that might have been removed or had errors previously
    const validInstanceIds = new Set(this.currentBlockInstances.map(b => b.instanceId));
    for (const instId in this.currentTickOutputs) {
        if (!validInstanceIds.has(instId)) {
            delete this.currentTickOutputs[instId];
        }
    }

    // Initialize currentTickOutputs for all current instances with their last known outputs
    // This ensures that if a block doesn't run in a tick (e.g., due to cycle or error),
    // downstream blocks can still use its last valid output.
    this.currentBlockInstances.forEach(instance => {
        if (!this.currentTickOutputs[instance.instanceId]) {
            this.currentTickOutputs[instance.instanceId] = { ...instance.lastRunOutputs };
        }
    });


    for (const instanceId of orderedInstanceIds) {
      const instance = this.currentBlockInstances.find(b => b.instanceId === instanceId);
      if (instance) {
        // Ensure currentTickOutputs for the instance is initialized if it wasn't already
        if (!this.currentTickOutputs[instance.instanceId]) {
            this.currentTickOutputs[instance.instanceId] = { ...instance.lastRunOutputs };
        }
        this.handleRunInstance(instance, audioContextInfo);
      } else {
        // This case should ideally not happen if orderedInstanceIds is derived from currentBlockInstances
        console.warn(`[LogicExecutionService] Instance ${instanceId} not found during execution loop.`);
      }
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
