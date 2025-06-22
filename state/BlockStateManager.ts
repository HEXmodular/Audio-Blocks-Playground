
import { v4 as uuidv4 } from 'uuid';
import { BlockInstance, BlockDefinition, BlockParameter, BlockParameterDefinition, BlockPort } from '@interfaces/common';
import { compactRendererRegistry } from '@services/block-definitions/compactRendererRegistry';
// import { ALL_BLOCK_DEFINITIONS } from '@constants/constants'; // OLD
import { ALL_BLOCK_DEFINITIONS as CONSTANT_DEFINITIONS } from '@constants/constants'; // NEW
import { ALL_NATIVE_BLOCK_DEFINITIONS } from '@services/block-definitions/nativeBlockRegistry'; // Added
import { RULE_110_BLOCK_DEFINITION } from '@constants/automata';
// import { LYRIA_MASTER_BLOCK_DEFINITION } from '@constants/lyria'; // Removed
import { LyriaMasterBlock } from '@services/lyria-blocks/LyriaMaster'; // Added

const INITIAL_DEFINITIONS_FROM_CODE: BlockDefinition[] = [
  ...CONSTANT_DEFINITIONS,
  ...ALL_NATIVE_BLOCK_DEFINITIONS
];

// --- Helper Functions (co-located with the class) ---
export const deepCopyParametersAndEnsureTypes = (definitionParams: BlockParameterDefinition[]): BlockInstance['parameters'] => {
  return definitionParams.map(paramDef => {
    const typedDefaultValue = paramDef.defaultValue;
    let finalCurrentValue = typedDefaultValue;

    if (paramDef.type === 'step_sequencer_ui' && Array.isArray(typedDefaultValue)) {
      finalCurrentValue = [...typedDefaultValue];
    } else if (paramDef.type === 'step_sequencer_ui') {
      const numSteps = typeof paramDef.steps === 'number' && paramDef.steps > 0 ? paramDef.steps : 4;
      finalCurrentValue = Array(numSteps).fill(false);
    }

    const instanceParam: BlockParameter = {
      id: paramDef.id,
      name: paramDef.name,
      type: paramDef.type,
      options: paramDef.options ? JSON.parse(JSON.stringify(paramDef.options)) : undefined,
      min: paramDef.min,
      max: paramDef.max,
      step: paramDef.step,
      description: paramDef.description,
      defaultValue: typedDefaultValue,
      currentValue: finalCurrentValue,
      steps: paramDef.steps,
      isFrequency: paramDef.isFrequency,
    };
    return instanceParam;
  });
};

export const getDefaultOutputValue = (portType: BlockPort['type']): any => {
  switch (portType) {
    case 'audio':
    case 'number':
      return 0;
    case 'string':
      return "";
    case 'boolean':
    case 'gate':
      return false;
    case 'trigger':
      return null;
    case 'any':
    default:
      return null;
  }
};

const CORE_DEFINITION_IDS_SET = new Set(INITIAL_DEFINITIONS_FROM_CODE.map(def => def.id)); // UPDATED

// --- BlockStateManager Class ---

// Simple debounce function
function debounce<T extends (...args: any[]) => void>(func: T, wait: number): (...args: Parameters<T>) => void {
  let timeout: number | undefined;
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = window.setTimeout(later, wait);
  };
}

const DEBOUNCE_WAIT_MS = 300; // Or another suitable value

export class BlockStateManager {
  private static _instance: BlockStateManager | null = null;

  private _blockDefinitions: BlockDefinition[];
  private _blockInstances: BlockInstance[];
  private _onDefinitionsChangeCallback: ((definitions: BlockDefinition[]) => void) | null = null;
  private _onInstancesChangeCallback: ((instances: BlockInstance[]) => void) | null = null;
  private _initializationDone: boolean = false;
  private _debouncedSaveInstances: () => void;
  private _debouncedSaveDefinitions: () => void;
  private _selectedBlockInstanceId: string | null = null; // Added selected instance ID state

  public static getInstance(): BlockStateManager {
    if (BlockStateManager._instance === null) {
      BlockStateManager._instance = new BlockStateManager();
    }
    return BlockStateManager._instance;
  }

  public init(onDefinitionsChange: (definitions: BlockDefinition[]) => void, onInstancesChange: (instances: BlockInstance[]) => void): void {
    this._onDefinitionsChangeCallback = onDefinitionsChange;
    this._onInstancesChangeCallback = onInstancesChange;
    if (this._onDefinitionsChangeCallback) this._onDefinitionsChangeCallback([...this._blockDefinitions]);
    if (this._onInstancesChangeCallback) this._onInstancesChangeCallback([...this._blockInstances]);
  }

  private constructor() {
    // Initialize debounced functions
    this._debouncedSaveInstances = debounce(this._saveInstancesToLocalStorageInternal.bind(this), DEBOUNCE_WAIT_MS);
    this._debouncedSaveDefinitions = debounce(this._saveDefinitionsToLocalStorageInternal.bind(this), DEBOUNCE_WAIT_MS);

    this._blockDefinitions = this._loadDefinitions(); // Loads from LS
    this._blockInstances = this._loadAndProcessInstances(this._blockDefinitions); // Loads from LS
    
    // this._onDefinitionsChangeCallback([...this._blockDefinitions]); // Removed
    // this._onInstancesChangeCallback([...this._blockInstances]); // Removed
    
    this._initializationDone = true;
    // Initial saves should still happen directly
    this._saveDefinitionsToLocalStorageInternal(); // Save once on init
    this._saveInstancesToLocalStorageInternal();   // Save once on init
    this.getDefinitionForBlock = this.getDefinitionForBlock.bind(this); // Bind the method to the instance context
    this.updateBlockInstance = this.updateBlockInstance.bind(this); // Ensure 'this' context for updateBlockInstance
  }


  private _loadDefinitions(): BlockDefinition[] {
    let mergedDefinitions: BlockDefinition[] = JSON.parse(JSON.stringify(INITIAL_DEFINITIONS_FROM_CODE)); // UPDATED
    const definitionsById = new Map<string, BlockDefinition>(mergedDefinitions.map(def => [def.id, def]));

    try {
      const savedDefinitionsJson = localStorage.getItem('audioBlocks_definitions');
      if (savedDefinitionsJson) {
        const savedDefinitions: BlockDefinition[] = JSON.parse(savedDefinitionsJson);
        for (const savedDef of savedDefinitions) {
          const processedSavedDef: BlockDefinition = {
            ...savedDef,
            parameters: savedDef.parameters.map((p: any) => {
              let typedDefaultValue = p.defaultValue;
              if (p.type === 'slider' || p.type === 'knob' || p.type === 'number_input') {
                const parsedDefault = parseFloat(p.defaultValue as string);
                typedDefaultValue = !isNaN(parsedDefault) ? parsedDefault : (p.min !== undefined && !isNaN(parseFloat(p.min as any)) ? parseFloat(p.min as any) : 0);
              } else if (p.type === 'toggle') {
                typedDefaultValue = typeof p.defaultValue === 'boolean' ? p.defaultValue : String(p.defaultValue).toLowerCase() === 'true';
              } else if (p.type === 'select' && p.options && p.options.length > 0 && !p.options.find((opt: {value:any}) => opt.value === p.defaultValue)) {
                typedDefaultValue = p.options[0].value;
              } else if (p.type === 'step_sequencer_ui') {
                if (Array.isArray(p.defaultValue) && p.defaultValue.every((val: any) => typeof val === 'boolean')) {
                    typedDefaultValue = p.defaultValue;
                } else {
                    const numSteps = typeof p.steps === 'number' && p.steps > 0 ? p.steps : 4;
                    typedDefaultValue = Array(numSteps).fill(false);
                }
              }
              const paramDef: BlockParameterDefinition = {
                id: p.id, name: p.name, type: p.type, defaultValue: typedDefaultValue, 
                options: p.options, min: p.min, max: p.max, step: p.step, description: p.description,
                steps: p.steps, isFrequency: p.isFrequency,
              };
              return paramDef;
            }),
            isAiGenerated: savedDef.isAiGenerated === undefined ? !CORE_DEFINITION_IDS_SET.has(savedDef.id) : savedDef.isAiGenerated,
          };
          definitionsById.set(processedSavedDef.id, processedSavedDef);
        }
        mergedDefinitions = Array.from(definitionsById.values());
      }
    } catch (error) {
      console.error(`BlockStateManager: Failed to load or merge block definitions from localStorage, using defaults only: ${(error as Error).message}`);
      mergedDefinitions = JSON.parse(JSON.stringify(INITIAL_DEFINITIONS_FROM_CODE)); // UPDATED
      mergedDefinitions = mergedDefinitions.map(def => ({
        ...def,
        parameters: def.parameters.map((p: any) => {
            let typedDefaultValue = p.defaultValue;
             if (p.type === 'slider' || p.type === 'knob' || p.type === 'number_input') {
                const parsedDefault = parseFloat(p.defaultValue as string);
                typedDefaultValue = !isNaN(parsedDefault) ? parsedDefault : (p.min !== undefined && !isNaN(parseFloat(p.min as any)) ? parseFloat(p.min as any) : 0);
              } else if (p.type === 'toggle') {
                typedDefaultValue = typeof p.defaultValue === 'boolean' ? p.defaultValue : String(p.defaultValue).toLowerCase() === 'true';
              } else if (p.type === 'select' && p.options && p.options.length > 0 && !p.options.find((opt: {value:any}) => opt.value === p.defaultValue)) {
                typedDefaultValue = p.options[0].value;
              } else if (p.type === 'step_sequencer_ui') {
                 if (Array.isArray(p.defaultValue) && p.defaultValue.every((val: any) => typeof val === 'boolean')) {
                    typedDefaultValue = p.defaultValue;
                } else {
                    const numSteps = typeof p.steps === 'number' && p.steps > 0 ? p.steps : 4;
                    typedDefaultValue = Array(numSteps).fill(false);
                }
              }
            return { ...p, defaultValue: typedDefaultValue, currentValue: undefined, steps: p.steps, isFrequency: p.isFrequency } as BlockParameterDefinition; 
        }),
        isAiGenerated: false,
      }));
    }
    return mergedDefinitions.map(def => {
      let rendererComponent; // Variable to hold the resolved component
      if (def.compactRendererId) {
        rendererComponent = compactRendererRegistry[def.compactRendererId];
        // console.log(`[BlockStateManager]`, {rendererComponent});
        if (!rendererComponent) {
          console.warn(`BlockStateManager: Compact renderer for ID '${def.compactRendererId}' not found in registry for definition '${def.id}'.`);
        }
      }

      // Clean up parameters (remove currentValue from definition)
      const parametersWithoutCurrentValue = def.parameters.map(p => {
        const { currentValue, ...paramDef } = p as any; // Cast to any to access currentValue if it sneakily exists
        return paramDef as BlockParameterDefinition;
      });

      // console.log({rendererComponent});
      return {
        ...def,
        parameters: parametersWithoutCurrentValue,
        compactRendererComponent: rendererComponent, // Assign the resolved component (or undefined)
      };
    });
  }

  private _loadAndProcessInstances(definitions: BlockDefinition[]): BlockInstance[] {
    let rawInstances: BlockInstance[] = [];
    try {
      const saved = localStorage.getItem('audioBlocks_instances');
      rawInstances = saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.error(`BlockStateManager: Failed to load raw block instances from localStorage, starting with empty set: ${(error as Error).message}`);
    }

    return rawInstances.map((loadedInst: any) => {
      const definition = definitions.find(def => def.id === loadedInst?.definitionId);
      const initialOutputs: Record<string, any> = {};
      if (definition) {
        definition.outputs.forEach(outPort => {
          initialOutputs[outPort.id] = getDefaultOutputValue(outPort.type);
        });
      }

      let instanceParams: BlockParameter[];
      if (definition) {
        const paramsFromDef = deepCopyParametersAndEnsureTypes(definition.parameters);
        instanceParams = paramsFromDef.map(defParamCopy => {
          const savedInstParam = loadedInst?.parameters?.find((p: any) => p.id === defParamCopy.id);
          if (savedInstParam && savedInstParam.currentValue !== undefined) {
            let rehydratedCurrentValue = savedInstParam.currentValue;
            // Type coercion for loaded parameter values
            if (defParamCopy.type === 'slider' || defParamCopy.type === 'knob' || defParamCopy.type === 'number_input') {
                const parsedSaved = parseFloat(savedInstParam.currentValue as string);
                rehydratedCurrentValue = isNaN(parsedSaved) ? defParamCopy.defaultValue : parsedSaved;
            } else if (defParamCopy.type === 'toggle') {
                rehydratedCurrentValue = typeof savedInstParam.currentValue === 'boolean' 
                    ? savedInstParam.currentValue 
                    : (String(savedInstParam.currentValue).toLowerCase() === 'true');
            } else if (defParamCopy.type === 'select') {
                rehydratedCurrentValue = defParamCopy.options?.find(opt => opt.value === savedInstParam.currentValue) 
                    ? savedInstParam.currentValue 
                    : defParamCopy.defaultValue; 
            } else if (defParamCopy.type === 'step_sequencer_ui') {
                if (Array.isArray(savedInstParam.currentValue) && savedInstParam.currentValue.every((v:any) => typeof v === 'boolean')) {
                    rehydratedCurrentValue = [...savedInstParam.currentValue];
                } else if (Array.isArray(defParamCopy.defaultValue) && defParamCopy.defaultValue.every((v:any) => typeof v === 'boolean')) {
                    rehydratedCurrentValue = [...defParamCopy.defaultValue];
                } else {
                    const numSteps = typeof defParamCopy.steps === 'number' && defParamCopy.steps > 0 ? defParamCopy.steps : 4;
                    rehydratedCurrentValue = Array(numSteps).fill(false);
                }
            }
            return { ...defParamCopy, currentValue: rehydratedCurrentValue };
          }
          return defParamCopy;
        });
      } else {
        instanceParams = loadedInst?.parameters || [];
        console.warn(`BlockStateManager: Definition for instance ${loadedInst?.name} (ID: ${loadedInst?.definitionId}) not found during instance processing. Parameters might be incorrect.`);
      }

      let initialInternalState: BlockInstance['internalState'] = {
        ...(loadedInst?.internalState || {}), // Spread existing internal state first
        // Initialize new flags, defaulting to false if not present in loadedInst?.internalState
        loggedWorkletSystemNotReady: loadedInst?.internalState?.loggedWorkletSystemNotReady || false,
        loggedAudioSystemNotActive: loadedInst?.internalState?.loggedAudioSystemNotActive || false,
        // needsAudioNodeSetup will be determined below
      };
      if (definition) {
        // Spread existing internalState first as before (already done above)
        // Determine needsAudioNodeSetup based on new logic
        if (definition.id === RULE_110_BLOCK_DEFINITION.id) {
            initialInternalState.needsAudioNodeSetup = false;
        } else {
            initialInternalState.needsAudioNodeSetup = !!(
                definition.runsAtAudioRate ||
                definition.audioWorkletProcessorName
            );
        }
      }
      // New general log for all instances being processed // REMOVED
      // console.log(`[BlockStateManager._loadAndProcessInstances] Processing instance: ID ${loadedInst?.instanceId}, DefID: ${loadedInst?.definitionId}, needsAudioNodeSetup: ${initialInternalState.needsAudioNodeSetup} ${loadedInst?.definitionId === 'tone-oscillator-v1' ? '<<< OSCILLATOR >>>' : ''}`);

      if (!loadedInst) {
        return {
          parameters: instanceParams,
          internalState: initialInternalState, // This now includes the initialized logging flags
          lastRunOutputs: loadedInst?.lastRunOutputs || initialOutputs,
          logs: loadedInst?.logs || [],
          modificationPrompts: loadedInst?.modificationPrompts || [],
          audioWorkletNodeId: undefined,
          lyriaServiceInstanceId: definition?.id === LyriaMasterBlock.getDefinition().id ? loadedInst?.lyriaServiceInstanceId : undefined, // Changed
        } as BlockInstance;
      }

      const { currentView, ...restOfLoadedInst } = loadedInst;

      return {
        ...restOfLoadedInst,
        parameters: instanceParams,
        internalState: initialInternalState, // This now includes the initialized logging flags
        lastRunOutputs: loadedInst?.lastRunOutputs || initialOutputs,
        logs: loadedInst?.logs || [],
        modificationPrompts: loadedInst?.modificationPrompts || [],
        audioWorkletNodeId: undefined,
        lyriaServiceInstanceId: definition?.id === LyriaMasterBlock.getDefinition().id ? loadedInst?.lyriaServiceInstanceId : undefined, // Changed
      } as BlockInstance;
    });
  }

  // Renamed original save methods
  private _saveDefinitionsToLocalStorageInternal() {
    if (!this._initializationDone) return;
    try {
      const definitionsToSave = this._blockDefinitions.map(def => ({
        ...def,
        parameters: def.parameters.map(p => {
          const { currentValue, ...paramDef } = p as any;
          return paramDef;
        })
      }));
      localStorage.setItem('audioBlocks_definitions', JSON.stringify(definitionsToSave));
    } catch (error) {
      console.error(`BlockStateManager: Failed to save block definitions to localStorage: ${(error as Error).message}`);
    }
  }

  private _saveInstancesToLocalStorageInternal() {
    if (!this._initializationDone) return;
    try {
      localStorage.setItem('audioBlocks_instances', JSON.stringify(this._blockInstances));
    } catch (error) {
      console.error(`BlockStateManager: Failed to save block instances to localStorage: ${(error as Error).message}`);
    }
  }

  // Public-facing methods now call the debounced versions
  private _saveDefinitionsToLocalStorage() {
    if (!this._initializationDone) return;
    this._debouncedSaveDefinitions();
  }

  private _saveInstancesToLocalStorage() {
    if (!this._initializationDone) return;
    this._debouncedSaveInstances();
  }

  // --- Public API ---

  public getBlockDefinitions(): BlockDefinition[] {
    return this._blockDefinitions;
  }

  public getBlockInstances(): BlockInstance[] {
    return this._blockInstances;
  }
  
  public getDefinitionForBlock(instanceOrDefinitionId: BlockInstance | string): BlockDefinition | undefined {
    const id = typeof instanceOrDefinitionId === 'string' ? instanceOrDefinitionId : instanceOrDefinitionId?.definitionId;
    return this._blockDefinitions.find(def => def.id === id);
  }

  public addLogToBlockInstance(instanceId: string, message: string): void {
    this._blockInstances = this._blockInstances.map(b =>
      b?.instanceId === instanceId
        ? { ...b, logs: [`${new Date().toLocaleTimeString()} - ${message}`, ...(b.logs || []).slice(0, 49)] }
        : b
    );
    this._saveInstancesToLocalStorage();
    if (this._onInstancesChangeCallback) this._onInstancesChangeCallback([...this._blockInstances]);
  }

  public addBlockDefinition(definition: BlockDefinition): void {
    const existingIndex = this._blockDefinitions.findIndex(d => d.id === definition.id);
    if (existingIndex > -1) {
      console.info(`BlockStateManager: Definition with ID ${definition.id} already exists. Updating it.`);
      this._blockDefinitions = [
        ...this._blockDefinitions.slice(0, existingIndex),
        definition,
        ...this._blockDefinitions.slice(existingIndex + 1)
      ];
    } else {
      this._blockDefinitions = [...this._blockDefinitions, definition];
    }
    this._saveDefinitionsToLocalStorage();
    if (this._onDefinitionsChangeCallback) this._onDefinitionsChangeCallback([...this._blockDefinitions]);
  }

  public updateBlockDefinition(definitionId: string, updates: Partial<BlockDefinition>): void {
    this._blockDefinitions = this._blockDefinitions.map(def =>
      def.id === definitionId ? { ...def, ...updates } : def
    );
    this._saveDefinitionsToLocalStorage();
    if (this._onDefinitionsChangeCallback) this._onDefinitionsChangeCallback([...this._blockDefinitions]);
  }
  
  public deleteBlockDefinition(definitionId: string): boolean {
    if (CORE_DEFINITION_IDS_SET.has(definitionId)) {
      console.warn(`BlockStateManager: Cannot delete core block definition: ${definitionId}`);
      alert(`Error: Core block definition "${definitionId}" cannot be deleted.`);
      return false;
    }

    const instancesUsingDefinition = this._blockInstances.filter(inst => inst.definitionId === definitionId);
    if (instancesUsingDefinition.length > 0) {
      console.warn(`BlockStateManager: Cannot delete block definition "${definitionId}": It is currently used by ${instancesUsingDefinition.length} instance(s).`);
      alert(`Error: Cannot delete block definition "${definitionId}". It is used by ${instancesUsingDefinition.length} block instance(s). Please delete these instances first.`);
      return false;
    }

    this._blockDefinitions = this._blockDefinitions.filter(def => def.id !== definitionId);
    this._saveDefinitionsToLocalStorage();
    if (this._onDefinitionsChangeCallback) this._onDefinitionsChangeCallback([...this._blockDefinitions]);
    console.info(`BlockStateManager: Block definition "${definitionId}" deleted.`);
    return true;
  }

  public addBlockInstance(definition: BlockDefinition, name?: string, position?: { x: number; y: number }): BlockInstance {
    const instanceCountForType = this._blockInstances.filter(b => b.definitionId === definition.id).length;
    const instanceName = name || `${definition.name} ${instanceCountForType + 1}`;

    const initialOutputs: Record<string, any> = {};
    definition.outputs.forEach(outPort => {
      initialOutputs[outPort.id] = getDefaultOutputValue(outPort.type);
    });

    let needsAudioSetup;
    if (definition.id === RULE_110_BLOCK_DEFINITION.id) {
        needsAudioSetup = false;
    } else {
        needsAudioSetup = !!(
            definition.runsAtAudioRate ||
            definition.audioWorkletProcessorName
        );
    }
    
    let initialInternalState: BlockInstance['internalState'] = {
        needsAudioNodeSetup: needsAudioSetup, // Set based on the new logic above
        loggedWorkletSystemNotReady: false,
        loggedAudioSystemNotActive: false,
    };
    // Ensure other specific internal state setups (e.g., for LyriaMasterBlock) are preserved
    if (definition.id === LyriaMasterBlock.getDefinition().id) {
        // Spread initialInternalState to keep the new logging flags
        initialInternalState = {
            ...initialInternalState,
            lyriaServiceReady: false, isPlaying: false, playRequest: false, pauseRequest: false, stopRequest: false,
            reconnectRequest: false, configUpdateNeeded: true, // Start with true to send initial params
            promptsUpdateNeeded: true, // Start with true to send initial prompt
            trackMuteUpdateNeeded: true, autoPlayInitiated: false,
                lastScale: definition.parameters.find(p=>p.id === 'scale')?.defaultValue, // These are fine as they are for a new instance
            lastBrightness: definition.parameters.find(p=>p.id === 'brightness')?.defaultValue,
            lastDensity: definition.parameters.find(p=>p.id === 'density')?.defaultValue,
            lastSeed: definition.parameters.find(p=>p.id === 'seed')?.defaultValue,
            lastTemperature: definition.parameters.find(p=>p.id === 'temperature')?.defaultValue,
            lastGuidanceScale: definition.parameters.find(p=>p.id === 'guidance_scale')?.defaultValue,
            lastTopK: definition.parameters.find(p=>p.id === 'top_k')?.defaultValue,
            lastBpm: definition.parameters.find(p=>p.id === 'bpm')?.defaultValue,
                lastEffectivePrompts: [],
                wasPausedDueToGateLow: false,
                prevStopTrigger: false,
                prevReconnectTrigger: false,
                lastMuteBass: false,
                lastMuteDrums: false,
                lastOnlyBassDrums: false,
        };
    }

    const newInstance: BlockInstance = {
      instanceId: `inst_${uuidv4()}`,
      definitionId: definition.id,
      name: instanceName,
      position: position || { x: 50 + Math.random() * 200, y: 50 + Math.random() * 100 },
      logs: [`Instance '${instanceName}' created.`],
      parameters: deepCopyParametersAndEnsureTypes(definition.parameters),
      internalState: initialInternalState, // This now includes the initialized logging flags
      lastRunOutputs: initialOutputs,
      modificationPrompts: [],
    };

    this._blockInstances = [...this._blockInstances, newInstance];
    this._saveInstancesToLocalStorage();
    if (this._onInstancesChangeCallback) this._onInstancesChangeCallback([...this._blockInstances]);
    return newInstance;
  }

  public updateBlockInstance(instanceId: string, updates: Partial<BlockInstance> | ((prev: BlockInstance) => BlockInstance)): void {
    let wasUpdated = false;
    this._blockInstances = this._blockInstances.map(currentBlockInst => {
      if (currentBlockInst?.instanceId === instanceId) {
        wasUpdated = true;

        let newBlockState: BlockInstance;
        if (typeof updates === 'function') {
          newBlockState = updates(currentBlockInst);
        } else {
          newBlockState = { ...currentBlockInst, ...updates };
        }

        return newBlockState;
      }
      return currentBlockInst;
    });

    if (wasUpdated) {
        this._saveInstancesToLocalStorage();
        if (this._onInstancesChangeCallback) this._onInstancesChangeCallback([...this._blockInstances]);
    }
  }

  public deleteBlockInstance(instanceId: string): void {
    this._blockInstances = this._blockInstances.filter(b => b?.instanceId !== instanceId);
    this._saveInstancesToLocalStorage();
    if (this._onInstancesChangeCallback) this._onInstancesChangeCallback([...this._blockInstances]);
  }

  public setAllBlockInstances(newInstances: BlockInstance[]): void {
    // REMOVED specific logging for inst_0d8a9770-06d7-4d8b-8503-1121765a2324
    // const targetInstanceFromFile = newInstances.find(inst => inst.instanceId === 'inst_0d8a9770-06d7-4d8b-8503-1121765a2324');
    // if (targetInstanceFromFile) {
    //     console.log(`[BlockStateManager.setAllBlockInstances] Received newInstances. For inst_0d8a9770-06d7-4d8b-8503-1121765a2324, initial internalState.needsAudioNodeSetup from input array: ${targetInstanceFromFile.internalState?.needsAudioNodeSetup}`);
    // } else {
    //     console.log(`[BlockStateManager.setAllBlockInstances] Received newInstances. Instance inst_0d8a9770-06d7-4d8b-8503-1121765a2324 not found in input array.`);
    // }
    this._blockInstances = newInstances;
    this._saveInstancesToLocalStorage();
    if (this._onInstancesChangeCallback) this._onInstancesChangeCallback([...this._blockInstances]);
  }

  public setAllBlockDefinitions(newDefinitions: BlockDefinition[]): void {
    this._blockDefinitions = newDefinitions;
    this._saveDefinitionsToLocalStorage();
    if (this._onDefinitionsChangeCallback) this._onDefinitionsChangeCallback([...this._blockDefinitions]);
  }

  public updateMultipleBlockInstances(instanceUpdates: Array<InstanceUpdatePayload>): void {
    // REMOVED specific logging for inst_0d8a9770-06d7-4d8b-8503-1121765a2324
    // const targetInstanceUpdate = instanceUpdates.find(update => update.instanceId === 'inst_0d8a9770-06d7-4d8b-8503-1121765a2324');
    // if (targetInstanceUpdate) {
    //     const updatesToLog = typeof targetInstanceUpdate.updates === 'function' ? 'Function update' : JSON.stringify(targetInstanceUpdate.updates);
    //     console.log(`[BlockStateManager.updateMultipleBlockInstances] Received updates for inst_0d8a9770-06d7-4d8b-8503-1121765a2324: ${updatesToLog}`);
    // }

    let wasAnyInstanceUpdated = false;

    this._blockInstances = this._blockInstances.map(currentBlockInst => {
      const updatesForThisInstance = instanceUpdates.filter(upd => upd.instanceId === currentBlockInst?.instanceId);

      if (updatesForThisInstance.length > 0) {
        wasAnyInstanceUpdated = true;


        const updatedBlockInst = updatesForThisInstance.reduce((accInst, currentUpdatePayload) => {
          let newBlockStatePartial: BlockInstance;
          if (typeof currentUpdatePayload.updates === 'function') {
            newBlockStatePartial = currentUpdatePayload.updates(accInst);
          } else {
            newBlockStatePartial = { ...accInst, ...currentUpdatePayload.updates };
          }
          return newBlockStatePartial;
        }, currentBlockInst);

        return updatedBlockInst;
      }
      return currentBlockInst;
    });

    if (wasAnyInstanceUpdated) {
      this._saveInstancesToLocalStorage(); // Call the debounced save
      if (this._onInstancesChangeCallback) this._onInstancesChangeCallback([...this._blockInstances]);
    }
  }

  public setSelectedBlockInstanceId(instanceId: string | null): void {
   this._selectedBlockInstanceId = instanceId;
  }
  
  public getSelectedBlockInstanceId(): string | null {
    return this._selectedBlockInstanceId;
  }
}

export type InstanceUpdatePayload = {
    instanceId: string;
    updates: Partial<BlockInstance> | ((prev: BlockInstance) => BlockInstance);
};

export default BlockStateManager.getInstance(); // Export the singleton instance directly;