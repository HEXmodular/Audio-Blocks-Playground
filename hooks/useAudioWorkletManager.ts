import { useState, useCallback, useRef } from 'react';
import { BlockDefinition, BlockParameter, AudioContextState } from '../types'; // Added AudioContextState
import {
    OSCILLATOR_BLOCK_DEFINITION,
    AUDIO_OUTPUT_BLOCK_DEFINITION,
    RULE_110_OSCILLATOR_BLOCK_DEFINITION,
} from '../constants'; // For PREDEFINED_WORKLET_DEFS

// Moved from useAudioEngine.ts
export const PREDEFINED_WORKLET_DEFS: BlockDefinition[] = [
    OSCILLATOR_BLOCK_DEFINITION,
    AUDIO_OUTPUT_BLOCK_DEFINITION,
    RULE_110_OSCILLATOR_BLOCK_DEFINITION,
    // LYRIA_MASTER_BLOCK_DEFINITION's specific worklet (LyriaOutputWorkletProcessor) is not directly registered by engine here.
    // LiveMusicService will internally manage its audio output.
];

// Moved from useAudioEngine.ts
export interface ManagedWorkletNodeInfo {
  node: AudioWorkletNode;
  definition: BlockDefinition;
  instanceId: string;
  inputGainNode?: GainNode;
}

export interface AudioWorkletManager {
  isAudioWorkletSystemReady: boolean;
  setIsAudioWorkletSystemReady: (ready: boolean) => void;
  registerWorkletProcessor: (processorName: string, workletCode: string) => Promise<boolean>;
  checkAndRegisterPredefinedWorklets: (logActivity?: boolean) => Promise<boolean>;
  setupManagedAudioWorkletNode: (instanceId: string, definition: BlockDefinition, initialParams: BlockParameter[]) => Promise<boolean>;
  updateManagedAudioWorkletNodeParams: (instanceId: string, parameters: BlockParameter[]) => void;
  sendManagedAudioWorkletNodeMessage: (instanceId: string, message: any) => void;
  removeManagedAudioWorkletNode: (instanceId: string) => void;
  removeAllManagedWorkletNodes: () => void;
  requestSamplesFromWorklet: (instanceId: string, timeoutMs?: number) => Promise<Float32Array>;
  managedWorkletNodesRef: React.RefObject<Map<string, ManagedWorkletNodeInfo>>;
}

interface UseAudioWorkletManagerProps {
  appLog: (message: string, isSystem?: boolean) => void;
  onStateChangeForReRender: () => void;
  audioContext: AudioContext | null; // Passed from useAudioEngine, sourced from useAudioContextManager
}

export const useAudioWorkletManager = ({
  appLog,
  onStateChangeForReRender,
  audioContext,
}: UseAudioWorkletManagerProps): AudioWorkletManager => {
  // Moved from useAudioEngine.ts
  const [isAudioWorkletSystemReady, _setIsAudioWorkletSystemReady] = useState(false);
  const registeredWorkletNamesRef = useRef<Set<string>>(new Set());
  const managedWorkletNodesRef = useRef<Map<string, ManagedWorkletNodeInfo>>(new Map());
  const [audioInitializationErrorLocal, _setAudioInitializationErrorLocal] = useState<string | null>(null);


  const setIsAudioWorkletSystemReady = useCallback((ready: boolean) => {
    _setIsAudioWorkletSystemReady(ready);
    // onStateChangeForReRender(); // Managed by useAudioEngine if it needs to react
  }, []);

  const setAudioInitializationError = useCallback((error: string | null) => {
    _setAudioInitializationErrorLocal(error);
    // Propagate error upwards if needed, or handle locally. For now, local.
    if (error) appLog(`[WorkletManager Error] ${error}`, true);
    onStateChangeForReRender(); // Ensure UI updates if error is displayed
  }, [appLog, onStateChangeForReRender]);


  // Moved from useAudioContextManager.ts (originally from useAudioEngine)
  const registerWorkletProcessor = useCallback(async (
    processorName: string, // AudioContext no longer passed as first arg, uses prop
    workletCode: string
  ): Promise<boolean> => {
    if (!audioContext) {
      appLog(`[WorkletManager Critical] Cannot register worklet ${processorName}: AudioContext is null.`, true);
      return false;
    }
    if (registeredWorkletNamesRef.current.has(processorName)) {
      return true;
    }
    if (!workletCode || !processorName) {
      appLog(`[WorkletManager Critical] Cannot register worklet ${processorName}: missing code or name.`, true);
      return false;
    }
    if (audioContext.state === 'closed') {
      appLog(`[WorkletManager Warn] Cannot register worklet ${processorName}: context is closed.`, true);
      return false;
    }

    let actualClassName: string | null = null;
    let objectURL: string | null = null;
    try {
      const classNameMatch = workletCode.match(/class\s+([A-Za-z_][A-Za-z0-9_]*)\s+extends\s+AudioWorkletProcessor/);
      if (classNameMatch && classNameMatch[1]) {
        actualClassName = classNameMatch[1];
      } else {
        actualClassName = processorName.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
        actualClassName = actualClassName.charAt(0).toUpperCase() + actualClassName.slice(1);
        appLog(`[WorkletManager Warn] Could not extract class name for worklet '${processorName}' via regex. Falling back to heuristic: '${actualClassName}'.`, true);
      }

      if (!actualClassName) {
        appLog(`[WorkletManager Critical] FATAL: Could not determine class name for worklet '${processorName}'.`, true);
        setAudioInitializationError(`Class name determination failed for ${processorName}`);
        return false;
      }

      const finalCode = `${workletCode}\n\ntry { registerProcessor('${processorName}', ${actualClassName}); } catch(e) { console.error("Error in registerProcessor call for ${processorName} within worklet script:", e); throw e; }`;
      const blob = new Blob([finalCode], { type: 'application/javascript' });
      objectURL = URL.createObjectURL(blob);
      await audioContext.audioWorklet.addModule(objectURL);
      registeredWorkletNamesRef.current.add(processorName);
      return true;
    } catch (e) {
      const error = e as Error;
      const cnForErrorLog = actualClassName || "[class name not determined before error]";
      const errMsgBase = `Error in registerWorkletProcessor for '${processorName}' (class '${cnForErrorLog}')`;

      if (error.message.includes('is already registered') || (error.name === 'NotSupportedError' && error.message.includes(processorName) && error.message.toLowerCase().includes('already registered'))) {
        appLog(`[WorkletManager Info] Worklet '${processorName}' reported as 'already registered'. Adding to cache.`, true);
        registeredWorkletNamesRef.current.add(processorName);
        return true;
      }
      const errMsg = `${errMsgBase}: ${error.message}`;
      console.error(errMsg, e);
      setAudioInitializationError(`RegFail ('${processorName}'): ${error.message.substring(0, 100)}`);
      registeredWorkletNamesRef.current.delete(processorName);
      return false;
    } finally {
      if (objectURL) URL.revokeObjectURL(objectURL);
    }
  }, [audioContext, appLog, setAudioInitializationError]);

  // Moved from useAudioContextManager.ts (originally from useAudioEngine)
  const checkAndRegisterPredefinedWorklets = useCallback(async (logActivity: boolean = true): Promise<boolean> => {
    if (!audioContext) {
      if (logActivity) appLog(`[WorkletManager Worklets] AudioContext is null. Cannot register worklets.`, true);
      return false;
    }
    const currentState: AudioContextState = audioContext.state;
    const allCached = PREDEFINED_WORKLET_DEFS.every(def =>
      !def.audioWorkletCode || !def.audioWorkletProcessorName || registeredWorkletNamesRef.current.has(def.audioWorkletProcessorName)
    );

    if (currentState === 'suspended') {
      if (logActivity) appLog(`[WorkletManager Worklets] Context is 'suspended'. All cached: ${allCached}. Cannot actively register.`, true);
      return allCached;
    }
    if (currentState === 'closed') {
      if (logActivity) appLog(`[WorkletManager Worklets] Context is 'closed'. Not ready. All cached: ${allCached}. Cannot actively register.`, true);
      return false;
    }
    if (logActivity) appLog(`[WorkletManager Worklets] Context is 'running'. Proceeding with registration check.`, true);

    let allEffectivelyRegistered = true;
    for (const def of PREDEFINED_WORKLET_DEFS) {
      if (def.audioWorkletCode && def.audioWorkletProcessorName) {
        if (!registeredWorkletNamesRef.current.has(def.audioWorkletProcessorName)) {
          if (logActivity) appLog(`[WorkletManager Worklets] Attempting registration for '${def.audioWorkletProcessorName}'...`, true);
          // registerWorkletProcessor now takes (name, code)
          const regSuccess = await registerWorkletProcessor(def.audioWorkletProcessorName, def.audioWorkletCode);
          if (!regSuccess) {
            allEffectivelyRegistered = false;
            if (logActivity) appLog(`[WorkletManager Worklets] Predefined worklet '${def.audioWorkletProcessorName}' registration FAILED.`, true);
            break;
          } else {
            if (logActivity) appLog(`[WorkletManager Worklets] Predefined worklet '${def.audioWorkletProcessorName}' registration SUCCEEDED.`, true);
          }
        } else {
          if (logActivity) appLog(`[WorkletManager Worklets] Predefined worklet '${def.audioWorkletProcessorName}' already cached.`, true);
        }
      }
    }
    return allEffectivelyRegistered;
  }, [audioContext, registerWorkletProcessor, appLog]);

  // Moved from useAudioEngine.ts
  const setupManagedAudioWorkletNode = useCallback(async (
    instanceId: string,
    definition: BlockDefinition,
    initialParams: BlockParameter[]
  ): Promise<boolean> => {
    if (!audioContext || audioContext.state !== 'running' || !isAudioWorkletSystemReady) {
      appLog(`[WorkletManager NodeSetup] Cannot setup '${definition.name}' (ID: ${instanceId}): System not ready (ctx: ${audioContext?.state}, worklets: ${isAudioWorkletSystemReady}).`, true);
      return false;
    }
    if (!definition.audioWorkletProcessorName || !definition.audioWorkletCode) {
      appLog(`[WorkletManager NodeSetup] Skipping '${definition.name}' (ID: ${instanceId}): Missing processorName or code.`, true);
      return true; // Not a failure, just a skip.
    }
    if (managedWorkletNodesRef.current.has(instanceId)) {
      appLog(`[WorkletManager NodeSetup] Node ID '${instanceId}' already exists. Skipping.`, true);
      return true;
    }

    if (!registeredWorkletNamesRef.current.has(definition.audioWorkletProcessorName)) {
      appLog(`[WorkletManager NodeSetup] Worklet '${definition.audioWorkletProcessorName}' for '${definition.name}' not registered. Attempting registration...`, true);
      const regSuccess = await registerWorkletProcessor(definition.audioWorkletProcessorName, definition.audioWorkletCode);
      if (!regSuccess) {
        appLog(`[WorkletManager NodeSetup Critical] Failed to register '${definition.audioWorkletProcessorName}'. Cannot create node.`, true);
        setAudioInitializationError(`WorkletNode RegFail: ${definition.audioWorkletProcessorName}`);
        return false;
      }
      appLog(`[WorkletManager NodeSetup] Worklet '${definition.audioWorkletProcessorName}' registered successfully.`, true);
    }

    try {
      const paramDescriptors: Record<string, any> = {};
      definition.parameters.forEach(p => {
        if (p.type === 'slider' || p.type === 'knob' || p.type === 'number_input') {
          const initialVal = initialParams.find(ip => ip.id === p.id)?.currentValue;
          paramDescriptors[p.id] = typeof initialVal === 'number' ? initialVal : (typeof p.defaultValue === 'number' ? p.defaultValue : 0);
        }
      });

      const workletNodeOptions: AudioWorkletNodeOptions = {
        processorOptions: {
          instanceId: instanceId,
          sampleRate: audioContext.sampleRate,
          ...(definition.id === OSCILLATOR_BLOCK_DEFINITION.id && {
            waveform: initialParams.find(p => p.id === 'waveform')?.currentValue || OSCILLATOR_BLOCK_DEFINITION.parameters.find(p => p.id === 'waveform')?.defaultValue
          }),
          ...(definition.id === RULE_110_OSCILLATOR_BLOCK_DEFINITION.id && {
            coreLength: initialParams.find(p => p.id === 'core_length')?.currentValue || RULE_110_OSCILLATOR_BLOCK_DEFINITION.parameters.find(p => p.id === 'core_length')?.defaultValue,
            initialPattern: initialParams.find(p => p.id === 'initial_pattern_plus_boundaries')?.currentValue || RULE_110_OSCILLATOR_BLOCK_DEFINITION.parameters.find(p => p.id === 'initial_pattern_plus_boundaries')?.defaultValue,
            outputMode: initialParams.find(p => p.id === 'output_mode')?.currentValue || RULE_110_OSCILLATOR_BLOCK_DEFINITION.parameters.find(p => p.id === 'output_mode')?.defaultValue,
          }),
        },
        parameterData: paramDescriptors,
      };

      const newNode = new AudioWorkletNode(audioContext, definition.audioWorkletProcessorName, workletNodeOptions);
      appLog(`[WorkletManager NodeSetup] AudioWorkletNode '${definition.audioWorkletProcessorName}' created for '${instanceId}'.`, true);

      // Note: Connection to masterGainNode for AUDIO_OUTPUT_BLOCK_DEFINITION is handled by useAudioEngine,
      // as useAudioWorkletManager doesn't have direct access to masterGainNode.
      // This is a slight change in responsibility. The inputGainNode is still created here if it's an output block.
      let inputGainNodeForOutputBlock: GainNode | undefined = undefined;
      if (definition.id === AUDIO_OUTPUT_BLOCK_DEFINITION.id) {
        inputGainNodeForOutputBlock = audioContext.createGain();
        const volumeParam = initialParams.find(p => p.id === 'volume');
        inputGainNodeForOutputBlock.gain.value = volumeParam ? Number(volumeParam.currentValue) : 0.7;
        inputGainNodeForOutputBlock.connect(newNode); // Connect gain to worklet input
        // The connection newNode -> masterGainNode will be done in useAudioEngine after this setup.
         appLog(`[WorkletManager NodeSetup] AudioOutput block '${instanceId}' internal gain node created. Connection to master gain will be handled by AudioEngine.`, true);
      }


      managedWorkletNodesRef.current.set(instanceId, { node: newNode, definition, instanceId, inputGainNode: inputGainNodeForOutputBlock });
      onStateChangeForReRender();
      return true;
    } catch (e: any) {
      const errMsg = `Failed to construct '${definition.audioWorkletProcessorName}' for '${instanceId}': ${e.message}`;
      console.error(`[WorkletManager NodeSetup Critical] ${errMsg}`, e);
      setAudioInitializationError(`WorkletNode Error: ${definition.audioWorkletProcessorName} - ${e.message.substring(0, 100)}`);
      return false;
    }
  }, [audioContext, isAudioWorkletSystemReady, registerWorkletProcessor, appLog, setAudioInitializationError, onStateChangeForReRender]);

  // Moved from useAudioEngine.ts
  const updateManagedAudioWorkletNodeParams = useCallback((instanceId: string, parameters: BlockParameter[]) => {
    if (!audioContext || audioContext.state !== 'running') return;
    const info = managedWorkletNodesRef.current.get(instanceId);
    if (!info) return;

    parameters.forEach(param => {
      const audioParam = info.node.parameters.get(param.id);
      if (audioParam && typeof param.currentValue === 'number') {
        if (info.definition.id === AUDIO_OUTPUT_BLOCK_DEFINITION.id && param.id === 'volume' && info.inputGainNode) {
          info.inputGainNode.gain.setTargetAtTime(param.currentValue, audioContext.currentTime, 0.01);
        } else {
          audioParam.setTargetAtTime(param.currentValue, audioContext.currentTime, 0.01);
        }
      }
    });
  }, [audioContext]);

  // Moved from useAudioEngine.ts
  const sendManagedAudioWorkletNodeMessage = useCallback((instanceId: string, message: any) => {
    const info = managedWorkletNodesRef.current.get(instanceId);
    if (info && info.node.port) {
      info.node.port.postMessage(message);
    }
  }, []);

  // Moved from useAudioEngine.ts
  const removeManagedAudioWorkletNode = useCallback((instanceId: string) => {
    const info = managedWorkletNodesRef.current.get(instanceId);
    if (info) {
      try {
        if (info.inputGainNode) {
          info.inputGainNode.disconnect();
        }
        info.node.disconnect();
        info.node.port?.close();
      } catch (e) {
        appLog(`[WorkletManager NodeRemove] Error disconnecting worklet '${instanceId}': ${(e as Error).message}`, true);
      }
      managedWorkletNodesRef.current.delete(instanceId);
      appLog(`[WorkletManager NodeRemove] Removed worklet node for '${instanceId}'.`, true);
      onStateChangeForReRender();
    }
  }, [appLog, onStateChangeForReRender]);

  const removeAllManagedWorkletNodes = useCallback(() => {
    managedWorkletNodesRef.current.forEach((info) => {
      removeManagedAudioWorkletNode(info.instanceId);
    });
     appLog(`[WorkletManager] All managed worklet nodes signal sent for removal.`, true);
  }, [removeManagedAudioWorkletNode, appLog]);


  // Moved from useAudioEngine.ts
  const requestSamplesFromWorklet = useCallback(async (instanceId: string, timeoutMs: number = 1000): Promise<Float32Array> => {
    const workletInfo = managedWorkletNodesRef.current.get(instanceId);
    if (!workletInfo || !workletInfo.node.port) {
      throw new Error(`WorkletNode or port not found for instance ${instanceId}`);
    }
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        workletInfo.node.port.removeEventListener('message', messageListener);
        reject(new Error(`Timeout waiting for samples from worklet ${instanceId} after ${timeoutMs}ms`));
      }, timeoutMs);
      const messageListener = (event: MessageEvent) => {
        if (event.data?.type === 'RECENT_SAMPLES_DATA' && event.data.samples instanceof Float32Array) {
          clearTimeout(timeoutId);
          workletInfo.node.port.removeEventListener('message', messageListener);
          resolve(event.data.samples);
        }
      };
      workletInfo.node.port.addEventListener('message', messageListener);
      workletInfo.node.port.postMessage({ type: 'GET_RECENT_SAMPLES' });
    });
  }, []);

  return {
    isAudioWorkletSystemReady,
    setIsAudioWorkletSystemReady,
    registerWorkletProcessor,
    checkAndRegisterPredefinedWorklets,
    setupManagedAudioWorkletNode,
    updateManagedAudioWorkletNodeParams,
    sendManagedAudioWorkletNodeMessage,
    removeManagedAudioWorkletNode,
    removeAllManagedWorkletNodes,
    requestSamplesFromWorklet,
    managedWorkletNodesRef,
  };
};
