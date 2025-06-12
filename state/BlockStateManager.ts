
import { v4 as uuidv4 } from 'uuid';
import { BlockInstance, BlockDefinition, BlockParameter, BlockParameterDefinition, BlockPort } from '@types/types';
import { ALL_BLOCK_DEFINITIONS, RULE_110_BLOCK_DEFINITION, RULE_110_OSCILLATOR_BLOCK_DEFINITION, LYRIA_MASTER_BLOCK_DEFINITION } from '@constants/constants';

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

const CORE_DEFINITION_IDS_SET = new Set(ALL_BLOCK_DEFINITIONS.map(def => def.id));

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
  private _blockDefinitions: BlockDefinition[];
  private _blockInstances: BlockInstance[];
  private _onDefinitionsChangeCallback: (definitions: BlockDefinition[]) => void;
  private _onInstancesChangeCallback: (instances: BlockInstance[]) => void;
  private _initializationDone: boolean = false;
  private _debouncedSaveInstances: () => void;
  private _debouncedSaveDefinitions: () => void;

  constructor(
    onDefinitionsChangeCallback: (definitions: BlockDefinition[]) => void,
    onInstancesChangeCallback: (instances: BlockInstance[]) => void
  ) {
    this._onDefinitionsChangeCallback = onDefinitionsChangeCallback;
    this._onInstancesChangeCallback = onInstancesChangeCallback;

    // Initialize debounced functions
    this._debouncedSaveInstances = debounce(this._saveInstancesToLocalStorageInternal.bind(this), DEBOUNCE_WAIT_MS);
    this._debouncedSaveDefinitions = debounce(this._saveDefinitionsToLocalStorageInternal.bind(this), DEBOUNCE_WAIT_MS);

    this._blockDefinitions = this._loadDefinitions(); // Loads from LS
    this._blockInstances = this._loadAndProcessInstances(this._blockDefinitions); // Loads from LS
    
    this._onDefinitionsChangeCallback([...this._blockDefinitions]);
    this._onInstancesChangeCallback([...this._blockInstances]);
    
    this._initializationDone = true;
    // Initial saves should still happen directly
    this._saveDefinitionsToLocalStorageInternal(); // Save once on init
    this._saveInstancesToLocalStorageInternal();   // Save once on init
  }

  private _handleRule110ParameterAdjustment(updatedInstance: BlockInstance, previousInstance: BlockInstance): BlockInstance {
    const definition = this._blockDefinitions.find(d => d.id === updatedInstance.definitionId);
    // Ensure definition is found and it's a Rule 110 type block
    if (!definition || (definition.id !== RULE_110_BLOCK_DEFINITION.id && definition.id !== RULE_110_OSCILLATOR_BLOCK_DEFINITION.id)) {
      return updatedInstance; // Return as is if not Rule 110 or no definition
    }

    const newCoreLengthParam = updatedInstance.parameters.find(p => p.id === 'core_length');
    const oldCoreLengthParam = previousInstance.parameters.find(p => p.id === 'core_length');

    if (newCoreLengthParam && oldCoreLengthParam && newCoreLengthParam.currentValue !== oldCoreLengthParam.currentValue) {
      const oldCL = Number(oldCoreLengthParam.currentValue);
      const newCL = Number(newCoreLengthParam.currentValue);
      const patternParamInstance = updatedInstance.parameters.find(p => p.id === 'initial_pattern_plus_boundaries');

      if (patternParamInstance && Array.isArray(patternParamInstance.currentValue)) {
        let modifiedPatternArrayValue = [...(patternParamInstance.currentValue as boolean[])];
        const idxOldR = oldCL + 1; // Index of the old Right Boundary
        const idxNewR = newCL + 1; // Index of the new Right Boundary
        const currentPatternLength = modifiedPatternArrayValue.length;
        const finalPatternLength = patternParamInstance.steps || 18; // Max possible length

        // Ensure array is long enough to avoid out-of-bounds, fill with false if necessary
        if (currentPatternLength < finalPatternLength) {
          modifiedPatternArrayValue = [
            ...modifiedPatternArrayValue,
            ...Array(finalPatternLength - currentPatternLength).fill(false),
          ];
        }

        if (idxOldR !== idxNewR) { // Only adjust if core_length actually changed where boundaries shift
            const stateAtOldR = (idxOldR < currentPatternLength && idxOldR >=0) ? modifiedPatternArrayValue[idxOldR] : false;

            if (newCL > oldCL) { // Core length increased, R-boundary moved right
                // Shift elements from newR to the right, to make space for the new R-boundary value
                for (let i = Math.min(finalPatternLength - 1, currentPatternLength -1 + (newCL - oldCL)); i > idxNewR; i--) {
                    if (i - (newCL-oldCL) >=0) {
                        modifiedPatternArrayValue[i] = modifiedPatternArrayValue[i - (newCL - oldCL)];
                    } else {
                        modifiedPatternArrayValue[i] = false;
                    }
                }
                if(idxNewR < finalPatternLength) modifiedPatternArrayValue[idxNewR] = stateAtOldR;

                for (let i = idxOldR; i < idxNewR; i++) {
                    if (i !== idxOldR && i < finalPatternLength) {
                         modifiedPatternArrayValue[i] = false;
                    }
                }
                 if (idxOldR < idxNewR && idxOldR !== (idxNewR - (newCL-oldCL)) && idxOldR < finalPatternLength) {
                    modifiedPatternArrayValue[idxOldR] = false;
                 }

            } else { // Core length decreased, R-boundary moved left
               if(idxNewR < finalPatternLength) modifiedPatternArrayValue[idxNewR] = stateAtOldR;

               for (let i = idxNewR + 1; i <= idxOldR && i < finalPatternLength; i++) {
                  modifiedPatternArrayValue[i] = false;
               }
            }
        }

        updatedInstance.parameters = updatedInstance.parameters.map(p =>
          p.id === 'initial_pattern_plus_boundaries'
            ? { ...p, currentValue: modifiedPatternArrayValue.slice(0, finalPatternLength) }
            : p
        );
        console.log(`BlockStateManager: Rule 110 type block (${updatedInstance.instanceId}, def: ${definition.id}): Adjusted initial_pattern_plus_boundaries for core_length change from ${oldCL} to ${newCL}.`);
      }
    }
    return updatedInstance;
  }

  private _loadDefinitions(): BlockDefinition[] {
    let mergedDefinitions: BlockDefinition[] = JSON.parse(JSON.stringify(ALL_BLOCK_DEFINITIONS));
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
      mergedDefinitions = JSON.parse(JSON.stringify(ALL_BLOCK_DEFINITIONS));
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
    return mergedDefinitions.map(def => ({
        ...def,
        parameters: def.parameters.map(p => {
            const { currentValue, ...paramDef } = p as any; 
            return paramDef as BlockParameterDefinition;
        })
    }));
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
      const definition = definitions.find(def => def.id === loadedInst.definitionId);
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
          const savedInstParam = loadedInst.parameters?.find((p: any) => p.id === defParamCopy.id);
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
        instanceParams = loadedInst.parameters || [];
        console.warn(`BlockStateManager: Definition for instance ${loadedInst.name} (ID: ${loadedInst.definitionId}) not found during instance processing. Parameters might be incorrect.`);
      }

      let initialInternalState: BlockInstance['internalState'] = {
        ...(loadedInst.internalState || {}), // Spread existing internal state first
        // Initialize new flags, defaulting to false if not present in loadedInst.internalState
        loggedWorkletSystemNotReady: loadedInst.internalState?.loggedWorkletSystemNotReady || false,
        loggedAudioSystemNotActive: loadedInst.internalState?.loggedAudioSystemNotActive || false,
      };
      if (definition) {
        initialInternalState.needsAudioNodeSetup = !!(definition.audioWorkletProcessorName || definition.id.startsWith('native-') || definition.id === 'gain-v1' || definition.id === 'system-audio-output-v1' || definition.id === 'analyser-oscilloscope-v1' || definition.id === LYRIA_MASTER_BLOCK_DEFINITION.id);
        if (definition.id === RULE_110_BLOCK_DEFINITION.id) { 
            initialInternalState.needsAudioNodeSetup = false;
        }
        if (definition.id === LYRIA_MASTER_BLOCK_DEFINITION.id) {
            // For Lyria, ensure specific fields are there, respecting loaded values for new flags
            initialInternalState = {
                lyriaServiceReady: false, isPlaying: false, playRequest: false, pauseRequest: false, stopRequest: false,
                reconnectRequest: false, configUpdateNeeded: false, promptsUpdateNeeded: false, trackMuteUpdateNeeded: false,
                autoPlayInitiated: false,
                // Preserve already spread initialInternalState which includes new flags and any other loaded state
                ...initialInternalState,
                // Explicitly set Lyria specific defaults if not loaded, but new flags are already handled
                lastScale: initialInternalState.lastScale ?? definition.parameters.find(p=>p.id === 'scale')?.defaultValue,
                lastBrightness: initialInternalState.lastBrightness ?? definition.parameters.find(p=>p.id === 'brightness')?.defaultValue,
                lastDensity: initialInternalState.lastDensity ?? definition.parameters.find(p=>p.id === 'density')?.defaultValue,
                lastSeed: initialInternalState.lastSeed ?? definition.parameters.find(p=>p.id === 'seed')?.defaultValue,
                lastTemperature: initialInternalState.lastTemperature ?? definition.parameters.find(p=>p.id === 'temperature')?.defaultValue,
                lastGuidanceScale: initialInternalState.lastGuidanceScale ?? definition.parameters.find(p=>p.id === 'guidance_scale')?.defaultValue,
                lastTopK: initialInternalState.lastTopK ?? definition.parameters.find(p=>p.id === 'top_k')?.defaultValue,
                lastBpm: initialInternalState.lastBpm ?? definition.parameters.find(p=>p.id === 'bpm')?.defaultValue,
                lastEffectivePrompts: initialInternalState.lastEffectivePrompts || [],
                wasPausedDueToGateLow: initialInternalState.wasPausedDueToGateLow || false,
                prevStopTrigger: initialInternalState.prevStopTrigger || false,
                prevReconnectTrigger: initialInternalState.prevReconnectTrigger || false,
                lastMuteBass: initialInternalState.lastMuteBass || false,
                lastMuteDrums: initialInternalState.lastMuteDrums || false,
                lastOnlyBassDrums: initialInternalState.lastOnlyBassDrums || false,
            };
        }
      }
      const { currentView, ...restOfLoadedInst } = loadedInst;

      return {
        ...restOfLoadedInst,
        parameters: instanceParams,
        internalState: initialInternalState, // This now includes the initialized logging flags
        lastRunOutputs: loadedInst.lastRunOutputs || initialOutputs,
        logs: loadedInst.logs || [],
        modificationPrompts: loadedInst.modificationPrompts || [],
        audioWorkletNodeId: undefined,
        lyriaServiceInstanceId: definition?.id === LYRIA_MASTER_BLOCK_DEFINITION.id ? loadedInst.lyriaServiceInstanceId : undefined,
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
    const id = typeof instanceOrDefinitionId === 'string' ? instanceOrDefinitionId : instanceOrDefinitionId.definitionId;
    return this._blockDefinitions.find(def => def.id === id);
  }

  public addLogToBlockInstance(instanceId: string, message: string): void {
    this._blockInstances = this._blockInstances.map(b =>
      b.instanceId === instanceId
        ? { ...b, logs: [`${new Date().toLocaleTimeString()} - ${message}`, ...(b.logs || []).slice(0, 49)] }
        : b
    );
    this._saveInstancesToLocalStorage();
    this._onInstancesChangeCallback([...this._blockInstances]);
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
    this._onDefinitionsChangeCallback([...this._blockDefinitions]);
  }

  public updateBlockDefinition(definitionId: string, updates: Partial<BlockDefinition>): void {
    this._blockDefinitions = this._blockDefinitions.map(def =>
      def.id === definitionId ? { ...def, ...updates } : def
    );
    this._saveDefinitionsToLocalStorage();
    this._onDefinitionsChangeCallback([...this._blockDefinitions]);
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
    this._onDefinitionsChangeCallback([...this._blockDefinitions]);
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

    let needsAudioSetup = !!(definition.audioWorkletProcessorName || definition.id.startsWith('native-') || definition.id === 'gain-v1' || definition.id === 'system-audio-output-v1' || definition.id === 'analyser-oscilloscope-v1' || definition.id === LYRIA_MASTER_BLOCK_DEFINITION.id);
    if (definition.id === RULE_110_BLOCK_DEFINITION.id) { 
        needsAudioSetup = false;
    }
    
    let initialInternalState: BlockInstance['internalState'] = {
        needsAudioNodeSetup: needsAudioSetup,
        loggedWorkletSystemNotReady: false, // Initialize new flag
        loggedAudioSystemNotActive: false,   // Initialize new flag
    };
    if (definition.id === LYRIA_MASTER_BLOCK_DEFINITION.id) {
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
    this._onInstancesChangeCallback([...this._blockInstances]);
    return newInstance;
  }

  public updateBlockInstance(instanceId: string, updates: Partial<BlockInstance> | ((prev: BlockInstance) => BlockInstance)): void {
    let wasUpdated = false;
    this._blockInstances = this._blockInstances.map(currentBlockInst => {
      if (currentBlockInst.instanceId === instanceId) {
        wasUpdated = true;
        let newBlockState: BlockInstance;
        if (typeof updates === 'function') {
          newBlockState = updates(currentBlockInst);
        } else {
          newBlockState = { ...currentBlockInst, ...updates };
        }

        // Call Rule 110 specific logic using the helper method
        // Pass the state *after* generic updates (newBlockState)
        // and the state *before* generic updates (currentBlockInst)
        newBlockState = this._handleRule110ParameterAdjustment(newBlockState, currentBlockInst);

        return newBlockState;
      }
      return currentBlockInst;
    });

    if (wasUpdated) {
        this._saveInstancesToLocalStorage();
        this._onInstancesChangeCallback([...this._blockInstances]);
    }
  }

  public deleteBlockInstance(instanceId: string): void {
    this._blockInstances = this._blockInstances.filter(b => b.instanceId !== instanceId);
    this._saveInstancesToLocalStorage();
    this._onInstancesChangeCallback([...this._blockInstances]);
  }

  public setAllBlockInstances(newInstances: BlockInstance[]): void {
    this._blockInstances = newInstances;
    this._saveInstancesToLocalStorage();
    this._onInstancesChangeCallback([...this._blockInstances]);
  }

  public setAllBlockDefinitions(newDefinitions: BlockDefinition[]): void {
    this._blockDefinitions = newDefinitions;
    this._saveDefinitionsToLocalStorage();
    this._onDefinitionsChangeCallback([...this._blockDefinitions]);
  }

  public updateMultipleBlockInstances(instanceUpdates: Array<InstanceUpdatePayload>): void {
    let wasAnyInstanceUpdated = false;

    this._blockInstances = this._blockInstances.map(currentBlockInst => {
      // Find all updates pertaining to the currentBlockInst
      const updatesForThisInstance = instanceUpdates.filter(upd => upd.instanceId === currentBlockInst.instanceId);

      if (updatesForThisInstance.length > 0) {
        wasAnyInstanceUpdated = true;
        // Reduce all applicable updates sequentially onto the currentBlockInst
        const updatedBlockInst = updatesForThisInstance.reduce((accInst, currentUpdatePayload) => {
          let newBlockStatePartial: BlockInstance;
          if (typeof currentUpdatePayload.updates === 'function') {
            newBlockStatePartial = currentUpdatePayload.updates(accInst);
          } else {
            newBlockStatePartial = { ...accInst, ...currentUpdatePayload.updates };
          }
          // Apply Rule 110 specific logic if necessary after each partial update within the batch for this instance
          // Note: _handleRule110ParameterAdjustment takes the fully updated new state and the state before this specific adjustment.
          // In a reduce chain, 'accInst' is the state *before* currentUpdatePayload.updates is applied.
          // However, _handleRule110ParameterAdjustment might be better applied *after* all updates for an instance are merged,
          // using the state *before this entire batch* for that instance as `previousInstance`.
          // For simplicity and to match single update behavior, we'll pass `accInst` as previous for Rule110.
          // This means if Rule110 logic depends on a parameter changed earlier in the *same batch* for the same instance, it will see it.
          return this._handleRule110ParameterAdjustment(newBlockStatePartial, accInst);
        }, currentBlockInst);
        return updatedBlockInst;
      }
      return currentBlockInst;
    });

    if (wasAnyInstanceUpdated) {
      this._saveInstancesToLocalStorage(); // Call the debounced save
      this._onInstancesChangeCallback([...this._blockInstances]); // Notify listeners once
    }
  }
}

export type InstanceUpdatePayload = {
    instanceId: string;
    updates: Partial<BlockInstance> | ((prev: BlockInstance) => BlockInstance);
};
