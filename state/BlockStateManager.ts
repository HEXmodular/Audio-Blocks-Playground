// занимается тем, что загружает и сохраняет блоки в localStorage, а также хранит ссылки на них


import { v4 as uuidv4 } from 'uuid';
import { BlockInstance, BlockDefinition, BlockParameter, BlockPort } from '@interfaces/block';
import { debounce } from '@utils/utils';

import { ALL_NATIVE_BLOCK_DEFINITIONS } from '@services/AudioNodeCreator';
import PubSubService from '@services/PubSubService';


const INITIAL_DEFINITIONS_FROM_CODE: BlockDefinition[] = [
  ...ALL_NATIVE_BLOCK_DEFINITIONS
];

// --- Helper Functions (co-located with the class) ---
// инициализирует текущие значения параметров из defaultValue при добавлении новых блоков
export const deepCopyParametersAndEnsureTypes = (definitionParams: BlockParameter[]): BlockInstance['parameters'] => {
  return definitionParams?.map(paramDef => {
    // const typedDefaultValue = paramDef.defaultValue;
    // let finalCurrentValue = typedDefaultValue;

    // if (paramDef.type === 'step_sequencer_ui' && Array.isArray(typedDefaultValue)) {
    //   finalCurrentValue = [...typedDefaultValue];
    // } else if (paramDef.type === 'step_sequencer_ui') {
    //   const numSteps = typeof paramDef.steps === 'number' && paramDef.steps > 0 ? paramDef.steps : 4;
    //   finalCurrentValue = Array(numSteps).fill(false);
    // }

    // TODO: min max находится в toneParam
    const instanceParam: BlockParameter = {
      ...paramDef,
      options: paramDef.options ? JSON.parse(JSON.stringify(paramDef.options)) : undefined,

      currentValue: paramDef.defaultValue
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

const DEBOUNCE_WAIT_MS = 300; // Or another suitable value

// --- BlockStateManager Class ---
export class BlockStateManager {
  private static _instance: BlockStateManager | null = null;
  private _blockDefinitions: BlockDefinition[];
  private _blockInstances: BlockInstance[];

  private _onDefinitionsChangeCallback: ((definitions: BlockDefinition[]) => void) | null = null;
  private _initializationDone: boolean = false;
  private _debouncedSaveInstances: () => void;
  private _debouncedSaveDefinitions: () => void;
  private _selectedBlockInstanceId: string | null = null; // Added selected instance ID state

  // для обработки только одного блока, чтобы не обновлялись вообще все блоки 
  private _onInstanceChange(instance: BlockInstance): void {
    // console.log("[BlockStateManager] _onInstancesChange", instances);
      if (!instance.instance) {
        // console.warn(`[👨🏿‍💼 BlockStateManager] No handler found for definition ID '${instance.definition?.id}'.`);
        return;
      }
      instance.instance.updateFromBlockInstance(instance);
      // console.log('[BlockStateManager] _onInstanceChange', instance);
    PubSubService.publish('insctance-changed', [instance]);
  }

  private _onInstancesChange(instances: BlockInstance[]): void {
    // console.log("[BlockStateManager] _onInstancesChange", instances);
    instances.forEach(instance => {
      if (!instance.instance) {
        // console.warn(`[👨🏿‍💼 BlockStateManager] No handler found for definition ID '${instance.definition?.id}'.`);
        return;
      }
      instance.instance.updateFromBlockInstance(instance);
    });
    PubSubService.publish('insctance-changed', [...this._blockInstances]);
  }

  public static getInstance(): BlockStateManager {
    if (BlockStateManager._instance === null) {
      BlockStateManager._instance = new BlockStateManager();
    }
    return BlockStateManager._instance;
  }

  public init(onDefinitionsChange: (definitions: BlockDefinition[]) => void, onInstancesChange: (instances: BlockInstance[]) => void): void {
    this._onDefinitionsChangeCallback = onDefinitionsChange;
    if (this._onDefinitionsChangeCallback) this._onDefinitionsChangeCallback([...this._blockDefinitions]);
    if (this._onInstancesChange) this._onInstancesChange([...this._blockInstances]);
  }

  private constructor() {
    // Initialize debounced functions
    this._debouncedSaveInstances = debounce(this._saveInstancesToLocalStorageInternal.bind(this), DEBOUNCE_WAIT_MS);
    this._debouncedSaveDefinitions = debounce(this._saveDefinitionsToLocalStorageInternal.bind(this), DEBOUNCE_WAIT_MS);

    this._blockDefinitions = this._loadDefinitions(); // Loads from LS
    this._blockInstances = this._loadAndProcessInstances(this._blockDefinitions); // Loads from LS

    this._initializationDone = true;
    // Initial saves should still happen directly
    this._saveDefinitionsToLocalStorageInternal(); // Save once on init
    this._saveInstancesToLocalStorageInternal();   // Save once on init
    this.updateBlockInstance = this.updateBlockInstance.bind(this); // Ensure 'this' context for updateBlockInstance
  }


  private _loadDefinitions(): BlockDefinition[] {
    // let mergedDefinitions: BlockDefinition[] = JSON.parse(JSON.stringify(INITIAL_DEFINITIONS_FROM_CODE)); // UPDATED
    const mergedDefinitions = INITIAL_DEFINITIONS_FROM_CODE;

    // !!!!
    // хранение дефинишинов для блоков из кода не имеет смысла, т.к. они не изменяются
    // плюс JSON.parse JSON.stringify убивает функции, которые мне нужны для асинхронного получения данных для полей
    // !!!!

    // const definitionsById = new Map<string, BlockDefinition>(mergedDefinitions.map(def => [def.id, def]));

    // try {
    //   const savedDefinitionsJson = localStorage.getItem('audioBlocks_definitions');
    //   if (savedDefinitionsJson) {
    //     const savedDefinitions: BlockDefinition[] = JSON.parse(savedDefinitionsJson);
    //     for (const savedDef of savedDefinitions) {
    //       const processedSavedDef: BlockDefinition = {
    //         ...savedDef,
    //         parameters: savedDef.parameters?.map((p: any) => {
    //           let typedDefaultValue = p.defaultValue;
    //           if (p.type === 'slider' || p.type === 'knob' || p.type === 'number_input') {
    //             const parsedDefault = parseFloat(p.defaultValue as string);
    //             typedDefaultValue = !isNaN(parsedDefault) ? parsedDefault : (p.min !== undefined && !isNaN(parseFloat(p.min as any)) ? parseFloat(p.min as any) : 0);
    //           } else if (p.type === 'toggle') {
    //             typedDefaultValue = typeof p.defaultValue === 'boolean' ? p.defaultValue : String(p.defaultValue).toLowerCase() === 'true';
    //           } else if (p.type === 'select' && p.options && p.options.length > 0 && !p.options.find((opt: { value: any }) => opt.value === p.defaultValue)) {
    //             typedDefaultValue = p.options[0].value;
    //           } else if (p.type === 'step_sequencer_ui') {
    //             if (Array.isArray(p.defaultValue) && p.defaultValue.every((val: any) => typeof val === 'boolean')) {
    //               typedDefaultValue = p.defaultValue;
    //             }  
    //           }
    //           const paramDef: BlockParameter = {
    //             ...p,
    //             defaultValue: typedDefaultValue
    //           };
    //           return paramDef;
    //         }),
    //         // isAiGenerated: savedDef.isAiGenerated === undefined ? !CORE_DEFINITION_IDS_SET.has(savedDef.id) : savedDef.isAiGenerated,
    //       };
    //       definitionsById.set(processedSavedDef.id, processedSavedDef);
    //     }
    //     mergedDefinitions = Array.from(definitionsById.values());
    //   }
    // } catch (error) {
    //   console.error(`[👨🏿‍💼 BlockStateManager]: Failed to load or merge block definitions from localStorage, using defaults only: ${(error as Error).message}`);
    //   mergedDefinitions = JSON.parse(JSON.stringify(INITIAL_DEFINITIONS_FROM_CODE)); // UPDATED
    //   mergedDefinitions = mergedDefinitions.map(def => ({
    //     ...def,
    //     parameters: def.parameters?.map((p: any) => {
    //       let typedDefaultValue = p.defaultValue;
    //       if (p.type === 'slider' || p.type === 'knob' || p.type === 'number_input') {
    //         const parsedDefault = parseFloat(p.defaultValue as string);
    //         typedDefaultValue = !isNaN(parsedDefault) ? parsedDefault : (p.min !== undefined && !isNaN(parseFloat(p.min as any)) ? parseFloat(p.min as any) : 0);
    //       } else if (p.type === 'toggle') {
    //         typedDefaultValue = typeof p.defaultValue === 'boolean' ? p.defaultValue : String(p.defaultValue).toLowerCase() === 'true';
    //       } else if (p.type === 'select' && p.options && p.options.length > 0 && !p.options.find((opt: { value: any }) => opt.value === p.defaultValue)) {
    //         typedDefaultValue = p.options[0].value;
    //       } else if (p.type === 'step_sequencer_ui') {
    //         if (Array.isArray(p.defaultValue) && p.defaultValue.every((val: any) => typeof val === 'boolean')) {
    //           typedDefaultValue = p.defaultValue;
    //         } else {
    //           const numSteps = typeof p.steps === 'number' && p.steps > 0 ? p.steps : 4;
    //           typedDefaultValue = Array(numSteps).fill(false);
    //         }
    //       }
    //       return { ...p, defaultValue: typedDefaultValue, currentValue: undefined, steps: p.steps, isFrequency: p.isFrequency } as BlockParameter;
    //     }),
    //     isAiGenerated: false,
    //   }));
    // }
    // по какой-то причине то что отсюда уходит теряет compactRendererComponent
    // возможно и другие поля тоже
    return mergedDefinitions.map(def => {

      // Clean up parameters (remove currentValue from definition)
      const parametersWithoutCurrentValue = def.parameters?.map(p => {
        const { currentValue, ...paramDef } = p as any; // Cast to any to access currentValue if it sneakily exists
        return paramDef as BlockParameter;
      });

      // console.log({rendererComponent});
      return {
        ...def,
        parameters: parametersWithoutCurrentValue,
      };
    });
  }

  private _loadAndProcessInstances(definitions: BlockDefinition[]): BlockInstance[] {
    let rawInstances: BlockInstance[] = [];
    try {
      const saved = localStorage.getItem('audioBlocks_instances');
      rawInstances = saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.error(`[👨🏿‍💼 BlockStateManager]: Failed to load raw block instances from localStorage, starting with empty set: ${(error as Error).message}`);
    }

    return rawInstances.map((loadedInst: any) => {
      const definition = definitions.find(def => def.id === loadedInst?.definition.id);
      const initialOutputs: Record<string, any> = {};
      if (definition) {
        definition.outputs.forEach(outPort => {
          initialOutputs[outPort.id] = getDefaultOutputValue(outPort.type);
        });
      }

      let instanceParams: BlockParameter[];
      if (definition) {
        const paramsFromDef = deepCopyParametersAndEnsureTypes(definition.parameters);
        instanceParams = paramsFromDef?.map(defParamCopy => {
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
              if (Array.isArray(savedInstParam.currentValue) && savedInstParam.currentValue.every((v: any) => typeof v === 'boolean')) {
                rehydratedCurrentValue = [...savedInstParam.currentValue];
              } else if (Array.isArray(defParamCopy.defaultValue) && defParamCopy.defaultValue.every((v: any) => typeof v === 'boolean')) {
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
        console.warn(`[👨🏿‍💼 BlockStateManager]: Definition for instance ${loadedInst?.name} (ID: ${loadedInst?.definitionId}) not found during instance processing. Parameters might be incorrect.`);
      }

      if (!loadedInst) {
        return {
          parameters: instanceParams,
          logs: loadedInst?.logs || [],
        };
      }

      const { currentView, ...restOfLoadedInst } = loadedInst;

      return {
        ...restOfLoadedInst,
        parameters: instanceParams,
        logs: loadedInst?.logs || [],
      };
    });
  }

  // Renamed original save methods
  private _saveDefinitionsToLocalStorageInternal() {
    if (!this._initializationDone) return;
    try {
      const definitionsToSave = this._blockDefinitions.map(def => ({
        ...def,
        parameters: def.parameters?.map(p => {
          const { currentValue, ...paramDef } = p as any;
          return paramDef;
        })
      }));
      localStorage.setItem('audioBlocks_definitions', JSON.stringify(definitionsToSave));
    } catch (error) {
      console.error(`[👨🏿‍💼 BlockStateManager]: Failed to save block definitions to localStorage: ${(error as Error).message}`);
    }
  }

  private _saveInstancesToLocalStorageInternal() {
    if (!this._initializationDone) return;
    try {
      // instance это ссылка на объект, который не нужно сохранять в localStorage, поэтому мы удаляем его из каждого экземпляра
      const blockInstances = [...this._blockInstances].map(instance => ({ ...instance, instance: null, lastChanges: null}))
      localStorage.setItem('audioBlocks_instances', JSON.stringify(blockInstances));
    } catch (error) {
      console.error(`[👨🏿‍💼 BlockStateManager]: Failed to save block instances to localStorage: ${(error as Error).message}`);
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

  public addLogToBlockInstance(instanceId: string, message: string): void {
    // this._blockInstances = this._blockInstances.map(b =>
    //   b?.instanceId === instanceId
    //     ? { ...b, logs: [`${new Date().toLocaleTimeString()} - ${message}`, ...(b.logs || []).slice(0, 49)] }
    //     : b
    // );
    // this._saveInstancesToLocalStorage();
    // if (this._onInstancesChange) this._onInstancesChange([...this._blockInstances]);
  }

  // public addBlockDefinition(definition: BlockDefinition): void {
  //   const existingIndex = this._blockDefinitions.findIndex(d => d.id === definition.id);
  //   if (existingIndex > -1) {
  //     console.info(`[👨🏿‍💼 BlockStateManager]: Definition with ID ${definition.id} already exists. Updating it.`);
  //     this._blockDefinitions = [
  //       ...this._blockDefinitions.slice(0, existingIndex),
  //       definition,
  //       ...this._blockDefinitions.slice(existingIndex + 1)
  //     ];
  //   } else {
  //     this._blockDefinitions = [...this._blockDefinitions, definition];
  //   }
  //   this._saveDefinitionsToLocalStorage();
  //   if (this._onDefinitionsChangeCallback) this._onDefinitionsChangeCallback([...this._blockDefinitions]);
  // }

  // public updateBlockDefinition(definitionId: string, updates: Partial<BlockDefinition>): void {
  //   this._blockDefinitions = this._blockDefinitions.map(def =>
  //     def.id === definitionId ? { ...def, ...updates } : def
  //   );
  //   this._saveDefinitionsToLocalStorage();
  //   if (this._onDefinitionsChangeCallback) this._onDefinitionsChangeCallback([...this._blockDefinitions]);
  // }


  public addBlockInstance(definition: BlockDefinition, name?: string, position?: { x: number; y: number }): BlockInstance {
    const instanceName = definition.name;

    const initialOutputs: Record<string, any> = {};
    definition.outputs.forEach(outPort => {
      initialOutputs[outPort.id] = getDefaultOutputValue(outPort.type);
    });


    const newInstance: BlockInstance = {
      instanceId: `inst_${uuidv4()}`,
      instance: null, // This will be set later when the instance is created
      definition,
      name: instanceName,
      position: position || { x: 50 + Math.random() * 200, y: 50 + Math.random() * 100 },
      logs: [`Instance '${instanceName}' created.`],
      parameters: deepCopyParametersAndEnsureTypes(definition.parameters), //definition.parameters причина выпила deepCopyParametersAndEnsureTypes неизвестна
    };

    this._blockInstances = [...this._blockInstances, newInstance];

    if (newInstance.parentId) {
      this._blockInstances = this._blockInstances.map(b =>
        b.instanceId === newInstance.parentId
          ? { ...b, children: [...(b.children || []), newInstance.instanceId] }
          : b
      );
    }

    this._saveInstancesToLocalStorage();
    if (this._onInstancesChange) this._onInstancesChange([...this._blockInstances]);
    return newInstance;
  }

  // отправляет теперь только обновления, а не по каждому блоку
  public updateBlockInstance(instanceId: string, updates: Partial<BlockInstance> | ((prev: BlockInstance) => BlockInstance)): void {
    const originalBlock = this._blockInstances.find(b => b?.instanceId === instanceId);
    if (!originalBlock) return;

    let updatedBlock: BlockInstance;
    let changes: Partial<BlockInstance> = {};

    delete originalBlock.lastChanges;
    
    // для передачи в рендер только изменений, чтобы только на них на них реагировать
    if (typeof updates === 'function') {
      updatedBlock = updates(originalBlock);
      // Calculate changes by comparing original and updated block
      Object.keys(updatedBlock).forEach(key => {
        const typedKey = key as keyof BlockInstance;
        if (updatedBlock[typedKey] !== originalBlock[typedKey]) {
          (changes as any)[typedKey] = updatedBlock[typedKey];
        }
      });
    } else {
      updatedBlock = { ...originalBlock, ...updates };
      changes = updates;
    }
    
    // Create new field to store the changes and remove old data
    updatedBlock = { 
      ...originalBlock, 
      ...changes,
      lastChanges: changes
    };

    // Handle parentId changes
    if (originalBlock.parentId !== updatedBlock.parentId) {
      // Remove from old parent's children
      if (originalBlock.parentId) {
        this._blockInstances = this._blockInstances.map(b =>
          b.instanceId === originalBlock.parentId
            ? { ...b, children: b.children?.filter(id => id !== instanceId) }
            : b
        );
      }
      // Add to new parent's children
      if (updatedBlock.parentId) {
        this._blockInstances = this._blockInstances.map(b =>
          b.instanceId === updatedBlock.parentId
            ? { ...b, children: [...(b.children || []), instanceId] }
            : b
        );
      }
    }

    this._blockInstances = this._blockInstances.map(b =>
      b?.instanceId === instanceId ? updatedBlock : b
    );

    // console.log("[👨🏿‍💼 BlockStateManager] Updating block instance:", updatedBlock);
    if (this._onInstanceChange) this._onInstanceChange(updatedBlock);
    this._saveInstancesToLocalStorage();
  }

  public deleteBlockInstance(instanceId: string): void {
    const blockToDelete = this._blockInstances.find(b => b?.instanceId === instanceId);
    if (!blockToDelete) return;

    // Recursively delete children if it's a container
    if (blockToDelete.children && blockToDelete.children.length > 0) {
      blockToDelete.children.forEach(childId => this.deleteBlockInstance(childId));
    }

    // Remove from parent's children array
    if (blockToDelete.parentId) {
      this._blockInstances = this._blockInstances.map(b =>
        b.instanceId === blockToDelete.parentId
          ? { ...b, children: b.children?.filter(id => id !== instanceId) }
          : b
      );
    }

    this._blockInstances = this._blockInstances.filter(b => b?.instanceId !== instanceId);
    this._saveInstancesToLocalStorage();
    if (this._onInstancesChange) this._onInstancesChange([...this._blockInstances]);
  }

  public setAllBlockInstances(newInstances: BlockInstance[]): void {
    this._blockInstances = newInstances;
    this._saveInstancesToLocalStorage();
    if (this._onInstancesChange) this._onInstancesChange([...this._blockInstances]);
  }

  public setAllBlockDefinitions(newDefinitions: BlockDefinition[]): void {
    this._blockDefinitions = newDefinitions;
    this._saveDefinitionsToLocalStorage();
    if (this._onDefinitionsChangeCallback) this._onDefinitionsChangeCallback([...this._blockDefinitions]);
  }

  public updateMultipleBlockInstances(instanceUpdates: Array<InstanceUpdatePayload>): void {
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
      if (this._onInstancesChange) this._onInstancesChange([...this._blockInstances]);
    }
  }

  public onBlockInstanceChaged(callback: (instances: BlockInstance[]) => void): void {
    // this._onInstancesChange = callback;
    // if (this._initializationDone) {
    //   callback([...this._blockInstances]); // Call immediately with current instances
    // }
  }
}

export type InstanceUpdatePayload = {
  instanceId: string;
  updates: Partial<BlockInstance> | ((prev: BlockInstance) => BlockInstance);
};

export default BlockStateManager.getInstance(); // Export the singleton instance directly;