
import { useState, useEffect, useCallback, useRef } from 'react';
// Fix: Import GenAIScale as a value, not just a type
import { Scale as GenAIScale } from '@google/genai';
import { BlockDefinition, BlockParameter, Connection, BlockInstance, BlockPort, AudioContextState, WeightedPrompt, LiveMusicGenerationConfig, Scale as AppScale } from '../types';
import { 
    OSCILLATOR_BLOCK_DEFINITION, 
    AUDIO_OUTPUT_BLOCK_DEFINITION, 
    NATIVE_BIQUAD_FILTER_BLOCK_DEFINITION, 
    NATIVE_DELAY_BLOCK_DEFINITION, 
    GAIN_BLOCK_DEFINITION, 
    NATIVE_OSCILLATOR_BLOCK_DEFINITION, 
    OSCILLOSCOPE_BLOCK_DEFINITION, 
    NATIVE_LFO_BLOCK_DEFINITION, 
    NATIVE_LFO_BPM_SYNC_BLOCK_DEFINITION, 
    NATIVE_AD_ENVELOPE_BLOCK_DEFINITION, 
    NATIVE_AR_ENVELOPE_BLOCK_DEFINITION, 
    NATIVE_ALLPASS_FILTER_BLOCK_DEFINITION,
    RULE_110_OSCILLATOR_BLOCK_DEFINITION,
    NUMBER_TO_CONSTANT_AUDIO_BLOCK_DEFINITION,
    LYRIA_MASTER_BLOCK_DEFINITION,
} from '../constants';
import { LiveMusicService, LiveMusicServiceCallbacks, PlaybackState, MusicGenerationMode, DEFAULT_MUSIC_GENERATION_CONFIG } from '../services/LiveMusicService';


declare global {
  interface Window {
    audioContext_global_ref?: AudioContext;
    // GoogleGenAILyria and GoogleGenAILyriaRealtimeSession are handled internally by LiveMusicService
  }
}

type ManagedWorkletNodeInfo = {
  node: AudioWorkletNode;
  definition: BlockDefinition;
  instanceId: string;
  inputGainNode?: GainNode; 
};

interface AllpassInternalNodes {
    inputPassthroughNode: GainNode;
    inputGain1: GainNode;
    inputDelay: DelayNode;
    feedbackGain: GainNode;
    feedbackDelay: DelayNode;
    summingNode: GainNode;
}

type ManagedNativeNodeInfo = {
  nodeForInputConnections: AudioNode; 
  nodeForOutputConnections: AudioNode; 
  mainProcessingNode?: AudioNode; 
  internalGainNode?: GainNode; 
  allpassInternalNodes?: AllpassInternalNodes;
  paramTargetsForCv?: Map<string, AudioParam>;
  definition: BlockDefinition;
  instanceId: string;
  constantSourceValueNode?: ConstantSourceNode;
};

// Store LiveMusicService instances
type ManagedLyriaServiceInfo = {
    instanceId: string;
    service: LiveMusicService;
    outputNode: AudioNode; // The output node from the service itself
};


export interface OscillatorWorkletParams {
  frequency: number;
  gain: number;
  waveform: 'sine' | 'square' | 'sawtooth' | 'triangle';
}

interface ActiveWebAudioConnection {
  connectionId: string;
  sourceNode: AudioNode;
  targetNode: AudioNode; 
  targetParam?: AudioParam; 
}

const PREDEFINED_WORKLET_DEFS = [
    OSCILLATOR_BLOCK_DEFINITION, 
    AUDIO_OUTPUT_BLOCK_DEFINITION, 
    RULE_110_OSCILLATOR_BLOCK_DEFINITION,
    // LYRIA_MASTER_BLOCK_DEFINITION's specific worklet (LyriaOutputWorkletProcessor) is not directly registered by engine here.
    // LiveMusicService will internally manage its audio output.
]; 

export interface InitAudioResult {
  context: AudioContext | null;
  workletsReady: boolean;
}

export interface AudioEngine { // Renamed from AudioEngineHookReturn
  audioContext: AudioContext | null;
  masterGainNode: GainNode | null;
  isAudioGloballyEnabled: boolean;
  isAudioWorkletSystemReady: boolean;
  audioInitializationError: string | null;
  toggleGlobalAudio: () => Promise<boolean>;
  initializeBasicAudioContext: (logActivity?: boolean, forceNoResume?: boolean) => Promise<InitAudioResult>;
  getSampleRate: () => number | null;
  setupManagedAudioWorkletNode: (instanceId: string, definition: BlockDefinition, initialParams: BlockParameter[]) => Promise<boolean>;
  updateManagedAudioWorkletNodeParams: (instanceId: string, parameters: BlockParameter[]) => void;
  sendManagedAudioWorkletNodeMessage: (instanceId: string, message: any) => void;
  removeManagedAudioWorkletNode: (instanceId: string) => void;
  registerWorkletProcessor: (context: AudioContext, processorName: string, workletCode: string) => Promise<boolean>;
  setupManagedNativeNode: (instanceId: string, definition: BlockDefinition, initialParams: BlockParameter[], currentBpm?: number) => Promise<boolean>;
  updateManagedNativeNodeParams: (instanceId: string, parameters: BlockParameter[], currentInputs?: Record<string, any>, currentBpm?: number) => void;
  triggerNativeNodeEnvelope: (instanceId: string, attackTime: number, decayTime: number, peakLevel: number) => void;
  triggerNativeNodeAttackHold: (instanceId: string, attackTime: number, sustainLevel: number) => void;
  triggerNativeNodeRelease: (instanceId: string, releaseTime: number) => void;
  removeManagedNativeNode: (instanceId: string) => void;
  removeAllManagedNodes: () => void;
  getAnalyserNodeForInstance: (instanceId: string) => AnalyserNode | null;
  updateAudioGraphConnections: (connections: Connection[], blockInstances: BlockInstance[], getDefinitionForBlock: (instance: BlockInstance) => BlockDefinition | undefined) => void;
  requestSamplesFromWorklet: (instanceId: string, timeoutMs?: number) => Promise<Float32Array>;
  availableOutputDevices: MediaDeviceInfo[];
  selectedSinkId: string;
  listOutputDevices: () => Promise<void>;
  setOutputDevice: (sinkId: string) => Promise<boolean>;
  
  // Lyria Service Management
  setupLyriaServiceForInstance: (instanceId: string, definition: BlockDefinition, addBlockLog: (message: string) => void) => Promise<boolean>;
  removeLyriaServiceForInstance: (instanceId: string) => void;
  getLyriaServiceInstance: (instanceId: string) => LiveMusicService | null;
  updateLyriaServiceState: (instanceId: string, blockInternalState: Record<string, any>, blockParams: Record<string,any>, blockInputs: Record<string,any>, clearRequestsFn: () => void) => void;
}


export const useAudioEngine = (
    appLog: (message: string, isSystem?: boolean) => void,
    onStateChangeForReRender: () => void
): AudioEngine => {
  const [audioContext, _setAudioContext] = useState<AudioContext | null>(null);
  const masterGainNodeRef = useRef<GainNode | null>(null);
  const [isAudioGloballyEnabled, _setIsAudioGloballyEnabled] = useState(false);

  const managedWorkletNodesRef = useRef<Map<string, ManagedWorkletNodeInfo>>(new Map());
  const managedNativeNodesRef = useRef<Map<string, ManagedNativeNodeInfo>>(new Map());
  const managedLyriaServiceInstancesRef = useRef<Map<string, ManagedLyriaServiceInfo>>(new Map());
  const registeredWorkletNamesRef = useRef<Set<string>>(new Set());
  const pendingRegistrationsRef = useRef(new Set());
  const activeWebAudioConnectionsRef = useRef<Map<string, ActiveWebAudioConnection>>(new Map());

  const [isAudioWorkletSystemReady, _setIsAudioWorkletSystemReady] = useState(false);
  const [audioInitializationError, _setAudioInitializationError] = useState<string | null>(null);

  const [availableOutputDevices, _setAvailableOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedSinkId, _setSelectedSinkId] = useState<string>('default');

  const setAudioContext = useCallback((ctx: AudioContext | null) => {
    _setAudioContext(ctx);
    onStateChangeForReRender();
  }, [onStateChangeForReRender]);

  const setIsAudioGloballyEnabled = useCallback((enabled: boolean) => {
    _setIsAudioGloballyEnabled(enabled);
    onStateChangeForReRender();
  }, [onStateChangeForReRender]);

  const setIsAudioWorkletSystemReady = useCallback((ready: boolean) => {
    _setIsAudioWorkletSystemReady(ready);
    onStateChangeForReRender();
  }, [onStateChangeForReRender]);

  const setAudioInitializationError = useCallback((error: string | null) => {
    _setAudioInitializationError(error);
    onStateChangeForReRender();
  }, [onStateChangeForReRender]);
  
  const setAvailableOutputDevices = useCallback((devices: MediaDeviceInfo[]) => {
    _setAvailableOutputDevices(devices);
    onStateChangeForReRender();
  }, [onStateChangeForReRender]);

  const setSelectedSinkId = useCallback((sinkId: string) => {
    _setSelectedSinkId(sinkId);
    onStateChangeForReRender();
  }, [onStateChangeForReRender]);


  const registerWorkletProcessor = useCallback(async (
    context: AudioContext,
    processorName: string,
    workletCode: string
  ): Promise<boolean> => {
    if (registeredWorkletNamesRef.current.has(processorName)) {
      return true;
    }
    if (pendingRegistrationsRef.current.has(processorName)) {
      appLog(`[AudioEngine Info] Worklet registration for '${processorName}' is already pending. Assuming success.`, true);
      return true;
    }
    if (!context || !workletCode || !processorName) {
      appLog(`[AudioEngine Critical] Cannot register worklet ${processorName}: missing context, code, or name.`, true);
      return false;
    }
     if (context.state === 'closed') {
      appLog(`[AudioEngine Warn] Cannot register worklet ${processorName}: context is closed.`, true);
      return false;
    }

    let actualClassName: string | null = null;
    let objectURL: string | null = null;
    try {
      pendingRegistrationsRef.current.add(processorName);
      const classNameMatch = workletCode.match(/class\s+([A-Za-z_][A-Za-z0-9_]*)\s+extends\s+AudioWorkletProcessor/);

      if (classNameMatch && classNameMatch[1]) {
        actualClassName = classNameMatch[1];
      } else {
        actualClassName = processorName.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
        actualClassName = actualClassName.charAt(0).toUpperCase() + actualClassName.slice(1);
        appLog(`[AudioEngine Warn] Could not extract class name for worklet '${processorName}' via regex. Falling back to heuristic: '${actualClassName}'. This might fail if the worklet code doesn't match.`, true);
      }

      if (!actualClassName) {
        appLog(`[AudioEngine Critical] FATAL: Could not determine class name for worklet '${processorName}'. Registration cannot proceed.`, true);
        setAudioInitializationError(audioInitializationError || `Class name determination failed for ${processorName}`);
        return false;
      }

      const finalCode = `${workletCode}\n\ntry { registerProcessor('${processorName}', ${actualClassName}); } catch(e) { console.error("Error in registerProcessor call for ${processorName} within worklet script:", e); throw e; }`;

      const blob = new Blob([finalCode], { type: 'application/javascript' });
      objectURL = URL.createObjectURL(blob);
      // pendingRegistrationsRef.current.add(processorName); // This was moved up
      await context.audioWorklet.addModule(objectURL);
      registeredWorkletNamesRef.current.add(processorName);
      return true;
    } catch (e) {
      const error = e as Error;
      const cnForErrorLog = actualClassName || "[class name not determined before error]";
      const errMsgBase = `Error in registerWorkletProcessor for '${processorName}' (class '${cnForErrorLog}') during addModule or worklet-side registration`;

      if (error.message.includes('is already registered') || (error.name === 'NotSupportedError' && error.message.includes(processorName) && error.message.toLowerCase().includes('already registered'))) {
        appLog(`[AudioEngine Info] Worklet '${processorName}' reported by browser as 'already registered' (Error: ${error.message}). Adding to cache and assuming available.`, true);
        registeredWorkletNamesRef.current.add(processorName);
        // No need to delete from registeredWorkletNamesRef here if it was just added
        return true;
      }

      const errMsg = `${errMsgBase}: ${error.message}`;
      console.error(errMsg, e);
      const newErrorMsg = `RegFail ('${processorName}'): ${error.message.substring(0,100)}`;
      setAudioInitializationError(audioInitializationError ? `${audioInitializationError}; ${newErrorMsg}` : newErrorMsg);
      registeredWorkletNamesRef.current.delete(processorName);
      return false;
    } finally {
      if (objectURL) URL.revokeObjectURL(objectURL);
      pendingRegistrationsRef.current.delete(processorName);
    }
  }, [appLog, setAudioInitializationError, onStateChangeForReRender, audioInitializationError]);

  const checkAndRegisterPredefinedWorklets = useCallback(async (contextToCheck: AudioContext, logActivity: boolean = true): Promise<boolean> => {
    const currentState: AudioContextState = contextToCheck.state;
    const allCached = PREDEFINED_WORKLET_DEFS.every(def =>
      !def.audioWorkletCode || !def.audioWorkletProcessorName || registeredWorkletNamesRef.current.has(def.audioWorkletProcessorName)
    );

    if (currentState === 'suspended') {
      if (logActivity) appLog(`[AudioEngine Worklets] Context is 'suspended'. All worklets cached: ${allCached}. Predefined worklets cannot be actively registered now.`, true);
      return allCached;
    }

    if (currentState === 'closed') {
      if (logActivity) appLog(`[AudioEngine Worklets] Context is 'closed'. Reporting worklets as not ready. All worklets cached: ${allCached}. Predefined worklets cannot be actively registered now.`, true);
      return false;
    }
    
    if (logActivity) appLog(`[AudioEngine Worklets] Context is 'running'. Proceeding with active registration check for predefined worklets.`, true);

    let allEffectivelyRegistered = true;
    for (const def of PREDEFINED_WORKLET_DEFS) {
      if (def.audioWorkletCode && def.audioWorkletProcessorName) {
        if (!registeredWorkletNamesRef.current.has(def.audioWorkletProcessorName)) {
          if (logActivity) appLog(`[AudioEngine Worklets] Attempting registration for '${def.audioWorkletProcessorName}'...`, true);
          const regSuccess = await registerWorkletProcessor(contextToCheck, def.audioWorkletProcessorName, def.audioWorkletCode);
          if (!regSuccess) {
            allEffectivelyRegistered = false;
            if (logActivity) appLog(`[AudioEngine Worklets] Predefined worklet '${def.audioWorkletProcessorName}' registration FAILED.`, true);
            break;
          } else {
            if (logActivity) appLog(`[AudioEngine Worklets] Predefined worklet '${def.audioWorkletProcessorName}' registration SUCCEEDED.`, true);
          }
        } else {
           if (logActivity) appLog(`[AudioEngine Worklets] Predefined worklet '${def.audioWorkletProcessorName}' already in registration cache.`, true);
        }
      }
    }
    return allEffectivelyRegistered;
  }, [registerWorkletProcessor, appLog, onStateChangeForReRender]);


  const initializeBasicAudioContext = useCallback(async (logActivity: boolean = true, forceNoResume: boolean = false): Promise<InitAudioResult> => {
    let localContextRef = audioContext;
    let workletsWereReady = false;
    let contextErrorMessage: string | null = null;

    if (localContextRef && localContextRef.state === 'closed') {
      if (logActivity) appLog("[AudioEngine Init] Existing AudioContext was found to be 'closed'. Will proceed to create a new one.", true);
      localContextRef = null;
    }

    if (localContextRef) {
      if (logActivity) appLog(`[AudioEngine Init] Existing AudioContext found (state: ${localContextRef.state}).`, true);
      const currentStateOfExistingContext: AudioContextState = localContextRef.state;
      if (currentStateOfExistingContext === 'suspended' && !forceNoResume) {
        if (logActivity) appLog("[AudioEngine Init] Attempting to resume existing suspended context...", true);
        try {
          await localContextRef.resume();
          if (logActivity) appLog(`[AudioEngine Init] Resume attempt finished. Context state: ${localContextRef.state}.`, true);
        } catch (resumeError) {
            if (logActivity) appLog(`[AudioEngine Init Error] Error resuming existing context: ${(resumeError as Error).message}`, true);
            contextErrorMessage = `Error resuming context: ${(resumeError as Error).message}`;
        }
      }

      workletsWereReady = await checkAndRegisterPredefinedWorklets(localContextRef, logActivity);
      setIsAudioWorkletSystemReady(workletsWereReady && localContextRef.state === 'running');

    } else {
      if (logActivity) appLog(audioContext ? "[AudioEngine Init] Existing context was closed. Creating new." : "[AudioEngine Init] No existing context. Creating new.", true);

      try {
        const newContext = new AudioContext();
        if (logActivity) appLog(`[AudioEngine Init] New AudioContext created (initial state: ${newContext.state}).`, true);

        if(masterGainNodeRef.current) {
            try { masterGainNodeRef.current.disconnect(); } catch(e) { /* ignore */ }
        }
        masterGainNodeRef.current = newContext.createGain();
        masterGainNodeRef.current.connect(newContext.destination);

        setAudioContext(newContext);
        localContextRef = newContext;

        const currentStateOfNewContext: AudioContextState = localContextRef.state;
        if (currentStateOfNewContext === 'suspended' && !forceNoResume) {
          if (logActivity) appLog("[AudioEngine Init] New context is suspended. Attempting resume...", true);
          await localContextRef.resume();
          if (logActivity) appLog(`[AudioEngine Init] Resume attempt finished. New context state: ${localContextRef.state}.`, true);
        }

        workletsWereReady = await checkAndRegisterPredefinedWorklets(localContextRef, logActivity);
        setIsAudioWorkletSystemReady(workletsWereReady && localContextRef.state === 'running');

      } catch (creationError) {
        const errorMsg = `Critical Error initializing new AudioContext: ${(creationError as Error).message}`;
        if (logActivity) appLog(`[AudioEngine Init Critical Error] ${errorMsg}`, true);
        contextErrorMessage = errorMsg;
        setAudioContext(null);
        setIsAudioWorkletSystemReady(false);
        workletsWereReady = false;
        localContextRef = null;
      }
    }

    if (contextErrorMessage && !audioInitializationError) {
        setAudioInitializationError(contextErrorMessage);
    }

    return { context: localContextRef, workletsReady: workletsWereReady };
  }, [audioContext, checkAndRegisterPredefinedWorklets, audioInitializationError, appLog, setAudioContext, setIsAudioWorkletSystemReady, setAudioInitializationError, onStateChangeForReRender]);


  const toggleGlobalAudio = useCallback(async (): Promise<boolean> => {
    setAudioInitializationError(null);
    let initResult = await initializeBasicAudioContext(true, false);
    let localAudioContextRef = initResult.context; 

    if (!localAudioContextRef) {
      setIsAudioGloballyEnabled(false);
      setIsAudioWorkletSystemReady(false);
      setAudioInitializationError(audioInitializationError || "AudioContext creation/retrieval failed in toggleGlobalAudio.");
      appLog("[AudioEngine Toggle] Failed to get/create AudioContext.", true);
      return false;
    }
    
    let currentContextState = localAudioContextRef.state;

    if (currentContextState === 'suspended') {
      appLog(`[AudioEngine Toggle] Context is suspended. Attempting resume before state change.`, true);
      try {
        await localAudioContextRef.resume();
        currentContextState = localAudioContextRef.state; // Re-read state
        appLog(`[AudioEngine Toggle] Resume attempt finished. Context state: ${currentContextState}.`, true);
        if (currentContextState === 'suspended' || currentContextState === 'closed') {
            setIsAudioGloballyEnabled(false);
            setAudioInitializationError(audioInitializationError || "Context remained suspended or closed after resume attempt.");
            appLog(`[AudioEngine Toggle] Context state is '${currentContextState}' after resume. Audio NOT enabled.`, true);
            return false;
        }
        const workletsStillReady = await checkAndRegisterPredefinedWorklets(localAudioContextRef, true);
        setIsAudioWorkletSystemReady(workletsStillReady);

      } catch (resumeError) {
        appLog(`[AudioEngine Toggle] Error resuming AudioContext: ${(resumeError as Error).message}`, true);
        setIsAudioGloballyEnabled(false);
        setAudioInitializationError(audioInitializationError || `Resume error: ${(resumeError as Error).message}`);
        return false;
      }
    } else if (currentContextState === 'closed') {
        appLog(`[AudioEngine Toggle] Context was found closed. Re-initializing.`, true);
        initResult = await initializeBasicAudioContext(true, false);
        localAudioContextRef = initResult.context; 
        if (!localAudioContextRef) { 
             setIsAudioGloballyEnabled(false);
             setAudioInitializationError(audioInitializationError || "Re-initialization failed to produce a context.");
             appLog(`[AudioEngine Toggle] Re-initialization failed (no context). Audio NOT enabled.`, true);
             return false;
        }
        currentContextState = localAudioContextRef.state; 
        if (currentContextState !== 'running') {
            setIsAudioGloballyEnabled(false);
            setAudioInitializationError(audioInitializationError || "Re-initialization failed to produce running context.");
            appLog(`[AudioEngine Toggle] Re-initialization failed (context not running). Audio NOT enabled.`, true);
            return false;
        }
        const workletsReadyPostReinit = await checkAndRegisterPredefinedWorklets(localAudioContextRef, true);
        setIsAudioWorkletSystemReady(workletsReadyPostReinit);
    }


    if (isAudioGloballyEnabled) {
      if (localAudioContextRef && localAudioContextRef.state === 'running') { 
        appLog(`[AudioEngine Toggle] Suspending AudioContext (was running).`, true);
        await localAudioContextRef.suspend();
      }
      setIsAudioGloballyEnabled(false);
      appLog(`[AudioEngine Toggle] Audio globally DISABLED. Context state: ${localAudioContextRef ? localAudioContextRef.state : 'N/A'}.`, true);
      return true;
    } else {
      const workletsAreReady = await checkAndRegisterPredefinedWorklets(localAudioContextRef, true); 
      setIsAudioWorkletSystemReady(workletsAreReady);
      
      if (workletsAreReady && localAudioContextRef && localAudioContextRef.state === 'running') { 
          setIsAudioGloballyEnabled(true);
          appLog(`[AudioEngine Toggle] Audio globally ENABLED. Worklets ready. Context state: ${localAudioContextRef.state}.`, true);
          return true;
      } else {
          setIsAudioGloballyEnabled(false);
          setAudioInitializationError(audioInitializationError || "Worklets not ready or context not running, cannot enable audio system fully.");
          appLog(`[AudioEngine Toggle] Worklets not ready or context not running (State: ${localAudioContextRef ? localAudioContextRef.state : 'N/A'}). Audio globally remains DISABLED.`, true);
          return false;
      }
    }
  }, [isAudioGloballyEnabled, initializeBasicAudioContext, checkAndRegisterPredefinedWorklets, appLog, setIsAudioGloballyEnabled, setIsAudioWorkletSystemReady, setAudioInitializationError, onStateChangeForReRender, audioInitializationError]);


  const getSampleRate = useCallback((): number | null => {
    return audioContext?.sampleRate || null;
  }, [audioContext]);


  const setupManagedAudioWorkletNode = useCallback(async (
    instanceId: string,
    definition: BlockDefinition,
    initialParams: BlockParameter[]
  ): Promise<boolean> => {
    if (!audioContext || audioContext.state !== 'running' || !isAudioWorkletSystemReady) {
      appLog(`[AudioEngine WorkletNodeSetup] Cannot setup '${definition.name}' (ID: ${instanceId}): Audio system not ready (context state: ${audioContext?.state}, worklets ready: ${isAudioWorkletSystemReady}).`, true);
      return false;
    }
    if (!definition.audioWorkletProcessorName || !definition.audioWorkletCode) {
        appLog(`[AudioEngine WorkletNodeSetup] Skipping setup for '${definition.name}' (ID: ${instanceId}): Missing audioWorkletProcessorName or audioWorkletCode.`, true);
        return true;
    }

    if (managedWorkletNodesRef.current.has(instanceId)) {
      appLog(`[AudioEngine WorkletNodeSetup] Node for instance ID '${instanceId}' already exists. Skipping recreation.`, true);
      return true;
    }

    if (!registeredWorkletNamesRef.current.has(definition.audioWorkletProcessorName)) {
        appLog(`[AudioEngine WorkletNodeSetup] Worklet processor '${definition.audioWorkletProcessorName}' for '${definition.name}' (ID: ${instanceId}) not registered. Attempting registration...`, true);
        const regSuccess = await registerWorkletProcessor(audioContext, definition.audioWorkletProcessorName, definition.audioWorkletCode);
        if (!regSuccess) {
            appLog(`[AudioEngine WorkletNodeSetup Critical] Failed to register worklet '${definition.audioWorkletProcessorName}' for '${definition.name}' (ID: ${instanceId}). Cannot create node.`, true);
            setAudioInitializationError(audioInitializationError || `WorkletNode RegFail: ${definition.audioWorkletProcessorName}`);
            return false;
        }
         appLog(`[AudioEngine WorkletNodeSetup] Worklet '${definition.audioWorkletProcessorName}' registered successfully during node setup for '${definition.name}'.`, true);
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
      appLog(`[AudioEngine WorkletNodeSetup] AudioWorkletNode '${definition.audioWorkletProcessorName}' created for instance '${instanceId}'.`, true);

      let inputGainNodeForOutputBlock: GainNode | undefined = undefined;
      if (definition.id === AUDIO_OUTPUT_BLOCK_DEFINITION.id && masterGainNodeRef.current) {
        inputGainNodeForOutputBlock = audioContext.createGain();
        const volumeParam = initialParams.find(p => p.id === 'volume');
        inputGainNodeForOutputBlock.gain.value = volumeParam ? Number(volumeParam.currentValue) : 0.7;

        inputGainNodeForOutputBlock.connect(newNode);
        newNode.connect(masterGainNodeRef.current);
        appLog(`[AudioEngine WorkletNodeSetup] AudioOutput block '${instanceId}' connected to master gain via internal volume gain.`, true);
      }

      managedWorkletNodesRef.current.set(instanceId, { node: newNode, definition, instanceId, inputGainNode: inputGainNodeForOutputBlock });
      onStateChangeForReRender();
      return true;

    } catch (e: any) {
      const errMsg = `Failed to construct AudioWorkletNode '${definition.audioWorkletProcessorName}' for instance '${instanceId}': ${e.message}`;
      console.error(`[AudioEngine WorkletNodeSetup Critical] ${errMsg}`, e);
      const newErrorMsg = `WorkletNode Error: ${definition.audioWorkletProcessorName} - ${e.message.substring(0,100)}`;
      setAudioInitializationError(audioInitializationError ? `${audioInitializationError}; ${newErrorMsg}` : newErrorMsg);
      return false;
    }
  }, [audioContext, isAudioWorkletSystemReady, registerWorkletProcessor, appLog, setAudioInitializationError, onStateChangeForReRender, audioInitializationError]);


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

  const sendManagedAudioWorkletNodeMessage = useCallback((instanceId: string, message: any) => {
    const info = managedWorkletNodesRef.current.get(instanceId);
    if (info && info.node.port) {
      info.node.port.postMessage(message);
    }
  }, []);

  const removeManagedAudioWorkletNode = useCallback((instanceId: string) => {
    const info = managedWorkletNodesRef.current.get(instanceId);
    if (info) {
      try {
        if(info.inputGainNode) {
            info.inputGainNode.disconnect();
        }
        info.node.disconnect();
        info.node.port?.close(); 
      } catch (e) {
        appLog(`[AudioEngine WorkletNodeRemove] Error disconnecting worklet node for '${instanceId}': ${(e as Error).message}`, true);
      }
      managedWorkletNodesRef.current.delete(instanceId);
      appLog(`[AudioEngine WorkletNodeRemove] Removed worklet node for instance '${instanceId}'.`, true);
      onStateChangeForReRender();
    }
  }, [appLog, onStateChangeForReRender]);

  const setupManagedNativeNode = useCallback(async (
    instanceId: string,
    definition: BlockDefinition,
    initialParams: BlockParameter[],
    currentBpm: number = 120
  ): Promise<boolean> => {
    if (!audioContext || audioContext.state !== 'running') {
        appLog(`[AudioEngine NativeNodeSetup] Cannot setup '${definition.name}' (ID: ${instanceId}): Audio system not ready.`, true);
        return false;
    }
    if (managedNativeNodesRef.current.has(instanceId)) {
        appLog(`[AudioEngine NativeNodeSetup] Native node for instance ID '${instanceId}' already exists. Skipping recreation.`, true);
        return true;
    }

    let mainNode: AudioNode | undefined;
    let outputNode: AudioNode; 
    let inputConnectNode: AudioNode; 
    let internalGain: GainNode | undefined;
    let allpassNodes: AllpassInternalNodes | undefined;
    let constSrcNodeForNumToAudio: ConstantSourceNode | undefined;

    const paramTargets = new Map<string, AudioParam>();

    try {
      switch (definition.id) {
        case NATIVE_OSCILLATOR_BLOCK_DEFINITION.id:
        case NATIVE_LFO_BLOCK_DEFINITION.id:
        case NATIVE_LFO_BPM_SYNC_BLOCK_DEFINITION.id:
          const osc = audioContext.createOscillator();
          internalGain = audioContext.createGain();
          osc.connect(internalGain);
          osc.start();
          mainNode = osc;
          inputConnectNode = internalGain; 
          outputNode = internalGain;
          paramTargets.set('frequency', osc.frequency);
          paramTargets.set('gain', internalGain.gain);
          break;
        case GAIN_BLOCK_DEFINITION.id:
          const gainNode = audioContext.createGain();
          mainNode = gainNode;
          inputConnectNode = gainNode;
          outputNode = gainNode;
          paramTargets.set('gain', gainNode.gain);
          break;
        case NATIVE_BIQUAD_FILTER_BLOCK_DEFINITION.id:
          const biquad = audioContext.createBiquadFilter();
          mainNode = biquad;
          inputConnectNode = biquad;
          outputNode = biquad;
          paramTargets.set('frequency', biquad.frequency);
          paramTargets.set('Q', biquad.Q);
          paramTargets.set('gain', biquad.gain);
          break;
        case NATIVE_DELAY_BLOCK_DEFINITION.id:
          const delay = audioContext.createDelay(5.0); 
          mainNode = delay;
          inputConnectNode = delay;
          outputNode = delay;
          paramTargets.set('delayTime', delay.delayTime);
          break;
        case OSCILLOSCOPE_BLOCK_DEFINITION.id:
            const analyser = audioContext.createAnalyser();
            mainNode = analyser;
            inputConnectNode = analyser;
            outputNode = analyser;
            break;
        case NATIVE_AD_ENVELOPE_BLOCK_DEFINITION.id:
        case NATIVE_AR_ENVELOPE_BLOCK_DEFINITION.id:
            const constSource = audioContext.createConstantSource();
            constSource.offset.value = 0; 
            constSource.start();
            mainNode = constSource;
            inputConnectNode = constSource; 
            outputNode = constSource;
            break;
        case NATIVE_ALLPASS_FILTER_BLOCK_DEFINITION.id:
            const apInputPassthrough = audioContext.createGain(); 
            const apInputGain1 = audioContext.createGain(); 
            const apInputDelay = audioContext.createDelay(1.0); 
            const apFeedbackGain = audioContext.createGain(); 
            const apFeedbackDelay = audioContext.createDelay(1.0); 
            const apSummingNode = audioContext.createGain(); 
            
            apInputGain1.connect(apInputDelay);
            apInputDelay.connect(apSummingNode); 
            apInputPassthrough.connect(apSummingNode); 

            apSummingNode.connect(apFeedbackDelay);
            apFeedbackDelay.connect(apFeedbackGain);
            apFeedbackGain.connect(apSummingNode);

            allpassNodes = {
                inputPassthroughNode: apInputPassthrough,
                inputGain1: apInputGain1, 
                inputDelay: apInputDelay,
                feedbackGain: apFeedbackGain,
                feedbackDelay: apFeedbackDelay,
                summingNode: apSummingNode
            };
            mainNode = undefined; 
            inputConnectNode = apInputGain1; 
            outputNode = apSummingNode;
            paramTargets.set('delayTime', apInputDelay.delayTime); 
            break;
        case NUMBER_TO_CONSTANT_AUDIO_BLOCK_DEFINITION.id:
            constSrcNodeForNumToAudio = audioContext.createConstantSource();
            constSrcNodeForNumToAudio.offset.value = 0; 
            constSrcNodeForNumToAudio.start();
            internalGain = audioContext.createGain(); 

            constSrcNodeForNumToAudio.connect(internalGain);
            
            mainNode = constSrcNodeForNumToAudio;
            inputConnectNode = internalGain; 
            outputNode = internalGain;
            paramTargets.set('gain', internalGain.gain); 
            break;

        default:
          appLog(`[AudioEngine NativeNodeSetup] Definition ID '${definition.id}' not recognized for native node setup.`, true);
          return false;
      }

      const nodeInfo: ManagedNativeNodeInfo = {
        nodeForInputConnections: inputConnectNode,
        nodeForOutputConnections: outputNode,
        mainProcessingNode: mainNode,
        internalGainNode: internalGain,
        allpassInternalNodes: allpassNodes,
        paramTargetsForCv: paramTargets,
        definition: definition,
        instanceId: instanceId,
        constantSourceValueNode: constSrcNodeForNumToAudio,
      };
      managedNativeNodesRef.current.set(instanceId, nodeInfo);
      updateManagedNativeNodeParams(instanceId, initialParams, undefined, currentBpm); 
      appLog(`[AudioEngine NativeNodeSetup] Native node for '${definition.name}' (ID: ${instanceId}) created.`, true);
      onStateChangeForReRender();
      return true;

    } catch (e) {
      const errorMsg = `Failed to construct native audio node for '${definition.name}' (ID: ${instanceId}): ${(e as Error).message}`;
      console.error(errorMsg, e);
      appLog(errorMsg, true);
      return false;
    }
  }, [audioContext, appLog, onStateChangeForReRender]);

  const updateManagedNativeNodeParams = useCallback((
    instanceId: string,
    parameters: BlockParameter[],
    currentInputs?: Record<string, any>,
    currentBpm: number = 120
  ) => {
    if (!audioContext || audioContext.state !== 'running') return;
    const info = managedNativeNodesRef.current.get(instanceId);
    if (!info) return;

    const { mainProcessingNode, internalGainNode, paramTargetsForCv, definition, allpassInternalNodes, constantSourceValueNode } = info;

    parameters.forEach(param => {
      const targetAudioParam = paramTargetsForCv?.get(param.id);
      if (targetAudioParam) {
        if (typeof param.currentValue === 'number') {
          targetAudioParam.setTargetAtTime(param.currentValue, audioContext.currentTime, 0.01);
        }
      } else if (mainProcessingNode) {
        if (definition.id === NATIVE_OSCILLATOR_BLOCK_DEFINITION.id || definition.id === NATIVE_LFO_BLOCK_DEFINITION.id || definition.id === NATIVE_LFO_BPM_SYNC_BLOCK_DEFINITION.id) {
          const oscNode = mainProcessingNode as OscillatorNode;
          if (param.id === 'waveform' && typeof param.currentValue === 'string') {
            oscNode.type = param.currentValue as OscillatorType;
          }
          if (param.id === 'frequency' && definition.id === NATIVE_LFO_BPM_SYNC_BLOCK_DEFINITION.id) {
             const bpmFractionParam = parameters.find(p => p.id === 'bpm_fraction');
             const bpmFraction = bpmFractionParam ? parseFloat(bpmFractionParam.currentValue as string) : 1;
             const beatsPerStep = bpmFraction;
             const secondsPerBeat = 60.0 / currentBpm;
             const secondsPerStep = secondsPerBeat * beatsPerStep;
             const lfoFreq = 1.0 / secondsPerStep;
             if(isFinite(lfoFreq) && lfoFreq > 0) {
                oscNode.frequency.setTargetAtTime(lfoFreq, audioContext.currentTime, 0.01);
             }
          }
        } else if (definition.id === NATIVE_BIQUAD_FILTER_BLOCK_DEFINITION.id) {
          const biquadNode = mainProcessingNode as BiquadFilterNode;
          if (param.id === 'type' && typeof param.currentValue === 'string') {
            biquadNode.type = param.currentValue as BiquadFilterType;
          }
        } else if (definition.id === OSCILLOSCOPE_BLOCK_DEFINITION.id) {
            const analyserNode = mainProcessingNode as AnalyserNode;
            if (param.id === 'fftSize' && typeof param.currentValue === 'number') {
                analyserNode.fftSize = param.currentValue;
            }
        } else if (allpassInternalNodes && definition.id === NATIVE_ALLPASS_FILTER_BLOCK_DEFINITION.id) {
            if (param.id === 'delayTime' && typeof param.currentValue === 'number') {
                allpassInternalNodes.inputDelay.delayTime.setTargetAtTime(param.currentValue, audioContext.currentTime, 0.01);
                allpassInternalNodes.feedbackDelay.delayTime.setTargetAtTime(param.currentValue, audioContext.currentTime, 0.01);
            }
            if (param.id === 'coefficient' && typeof param.currentValue === 'number') {
                allpassInternalNodes.inputPassthroughNode.gain.setTargetAtTime(-param.currentValue, audioContext.currentTime, 0.01); 
                allpassInternalNodes.feedbackGain.gain.setTargetAtTime(param.currentValue, audioContext.currentTime, 0.01);      
            }
        }
      }
      if (constantSourceValueNode && definition.id === NUMBER_TO_CONSTANT_AUDIO_BLOCK_DEFINITION.id && currentInputs && currentInputs.number_in !== undefined) {
        const numberIn = Number(currentInputs.number_in);
        const maxExpectedParam = parameters.find(p => p.id === 'max_input_value');
        const maxExpected = maxExpectedParam ? Number(maxExpectedParam.currentValue) : 255;
        
        let normalizedValue = 0;
        if (maxExpected !== 0) {
            normalizedValue = (numberIn / maxExpected) * 2 - 1; 
        }
        normalizedValue = Math.max(-1, Math.min(1, normalizedValue)); 

        constantSourceValueNode.offset.setTargetAtTime(normalizedValue, audioContext.currentTime, 0.01);
      }
    });
  }, [audioContext]);

  const triggerNativeNodeEnvelope = useCallback((instanceId: string, attackTime: number, decayTime: number, peakLevel: number) => {
    if (!audioContext || audioContext.state !== 'running') return;
    const info = managedNativeNodesRef.current.get(instanceId);
    if (!info || !info.mainProcessingNode || !(info.mainProcessingNode instanceof ConstantSourceNode)) return;

    const constSourceNode = info.mainProcessingNode as ConstantSourceNode;
    const now = audioContext.currentTime;
    constSourceNode.offset.cancelScheduledValues(now);
    constSourceNode.offset.setValueAtTime(0, now); 
    constSourceNode.offset.linearRampToValueAtTime(peakLevel, now + attackTime);
    constSourceNode.offset.linearRampToValueAtTime(0, now + attackTime + decayTime);
  }, [audioContext]);

  const triggerNativeNodeAttackHold = useCallback((instanceId: string, attackTime: number, sustainLevel: number) => {
    if (!audioContext || audioContext.state !== 'running') return;
    const info = managedNativeNodesRef.current.get(instanceId);
    if (!info || !info.mainProcessingNode || !(info.mainProcessingNode instanceof ConstantSourceNode)) return;

    const constSourceNode = info.mainProcessingNode as ConstantSourceNode;
    const now = audioContext.currentTime;
    constSourceNode.offset.cancelScheduledValues(now);
    constSourceNode.offset.setValueAtTime(constSourceNode.offset.value, now); 
    constSourceNode.offset.linearRampToValueAtTime(sustainLevel, now + attackTime);
  }, [audioContext]);

  const triggerNativeNodeRelease = useCallback((instanceId: string, releaseTime: number) => {
    if (!audioContext || audioContext.state !== 'running') return;
    const info = managedNativeNodesRef.current.get(instanceId);
    if (!info || !info.mainProcessingNode || !(info.mainProcessingNode instanceof ConstantSourceNode)) return;

    const constSourceNode = info.mainProcessingNode as ConstantSourceNode;
    const now = audioContext.currentTime;
    constSourceNode.offset.cancelScheduledValues(now);
    constSourceNode.offset.setValueAtTime(constSourceNode.offset.value, now); 
    constSourceNode.offset.linearRampToValueAtTime(0, now + releaseTime);
  }, [audioContext]);


  const removeManagedNativeNode = useCallback((instanceId: string) => {
    const info = managedNativeNodesRef.current.get(instanceId);
    if (info) {
      try {
        info.nodeForOutputConnections.disconnect();
        if (info.mainProcessingNode && info.mainProcessingNode !== info.nodeForOutputConnections && info.mainProcessingNode !== info.nodeForInputConnections) {
          info.mainProcessingNode.disconnect();
          if (info.mainProcessingNode instanceof OscillatorNode || info.mainProcessingNode instanceof ConstantSourceNode) {
            try { info.mainProcessingNode.stop(); } catch(e) {/* already stopped */}
          }
        }
        if (info.nodeForInputConnections !== info.nodeForOutputConnections && info.nodeForInputConnections !== info.mainProcessingNode) {
             info.nodeForInputConnections.disconnect();
        }
        if (info.internalGainNode) info.internalGainNode.disconnect();
        if (info.allpassInternalNodes) Object.values(info.allpassInternalNodes).forEach(node => node.disconnect());
        if (info.constantSourceValueNode) {
            info.constantSourceValueNode.disconnect();
            try { info.constantSourceValueNode.stop(); } catch(e) {/* already stopped */}
        }
      } catch (e) {
        appLog(`[AudioEngine NativeNodeRemove] Error disconnecting native node for '${instanceId}': ${(e as Error).message}`, true);
      }
      managedNativeNodesRef.current.delete(instanceId);
      appLog(`[AudioEngine NativeNodeRemove] Removed native node for instance '${instanceId}'.`, true);
      onStateChangeForReRender();
    }
  }, [appLog, onStateChangeForReRender]);

  const removeLyriaServiceForInstance = useCallback((instanceId: string) => {
    const info = managedLyriaServiceInstancesRef.current.get(instanceId);
    if (info) {
      info.service.dispose();
      try {
        if (masterGainNodeRef.current && info.outputNode) {
            try { info.outputNode.disconnect(masterGainNodeRef.current); } 
            catch(eInnerMaster) { /* console.warn(`Inner disconnect error for Lyria output from masterGain: ${eInnerMaster.message}`); */}
        }
        info.outputNode.disconnect();
      } catch (e) {
        appLog(`[AudioEngine LyriaRemove] Error disconnecting Lyria service outputNode for '${instanceId}': ${(e as Error).message}`, true);
      }
      managedLyriaServiceInstancesRef.current.delete(instanceId);
      appLog(`[AudioEngine] Lyria Service for instance '${instanceId}' disposed and removed.`, true);
      onStateChangeForReRender();
    }
  }, [appLog, onStateChangeForReRender]);

  const removeAllManagedNodes = useCallback(() => {
    managedWorkletNodesRef.current.forEach((_, instanceId) => removeManagedAudioWorkletNode(instanceId));
    managedNativeNodesRef.current.forEach((_, instanceId) => removeManagedNativeNode(instanceId));
    managedLyriaServiceInstancesRef.current.forEach((_, instanceId) => removeLyriaServiceForInstance(instanceId));
    appLog("[AudioEngine] All managed nodes removed.", true);
    onStateChangeForReRender();
  }, [removeManagedAudioWorkletNode, removeManagedNativeNode, removeLyriaServiceForInstance, onStateChangeForReRender]);

  const getAnalyserNodeForInstance = useCallback((instanceId: string): AnalyserNode | null => {
    const nativeInfo = managedNativeNodesRef.current.get(instanceId);
    if (nativeInfo && nativeInfo.definition.id === OSCILLOSCOPE_BLOCK_DEFINITION.id && nativeInfo.mainProcessingNode instanceof AnalyserNode) {
        return nativeInfo.mainProcessingNode;
    }
    return null;
  }, []);

  const updateAudioGraphConnections = useCallback((
    connections: Connection[],
    blockInstances: BlockInstance[],
    getDefinitionForBlock: (instance: BlockInstance) => BlockDefinition | undefined
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
      const fromWorkletInfo = managedWorkletNodesRef.current.get(fromInstance.instanceId);
      const fromNativeInfo = managedNativeNodesRef.current.get(fromInstance.instanceId);
      const fromLyriaInfo = managedLyriaServiceInstancesRef.current.get(fromInstance.instanceId);

      if (fromWorkletInfo) sourceAudioNode = fromWorkletInfo.node;
      else if (fromNativeInfo) sourceAudioNode = fromNativeInfo.nodeForOutputConnections;
      else if (fromLyriaInfo) sourceAudioNode = fromLyriaInfo.outputNode;


      let targetAudioNodeOrParam: AudioNode | AudioParam | undefined;
      const toWorkletInfo = managedWorkletNodesRef.current.get(toInstance.instanceId);
      const toNativeInfo = managedNativeNodesRef.current.get(toInstance.instanceId);

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
            targetAudioNodeOrParam = (toDef.id === AUDIO_OUTPUT_BLOCK_DEFINITION.id && toWorkletInfo.inputGainNode) ? toWorkletInfo.inputGainNode : toWorkletInfo.node;
        } else if (toNativeInfo) {
            if (toDef.id === NATIVE_ALLPASS_FILTER_BLOCK_DEFINITION.id && toNativeInfo.allpassInternalNodes) {
                if (sourceAudioNode && toNativeInfo.allpassInternalNodes.inputGain1 && toNativeInfo.allpassInternalNodes.inputPassthroughNode) {
                    try {
                        sourceAudioNode.connect(toNativeInfo.allpassInternalNodes.inputGain1);
                        newActiveConnections.set(`${conn.id}-path1`, { connectionId: conn.id, sourceNode: sourceAudioNode, targetNode: toNativeInfo.allpassInternalNodes.inputGain1 });
                        sourceAudioNode.connect(toNativeInfo.allpassInternalNodes.inputPassthroughNode); 
                        newActiveConnections.set(`${conn.id}-path2`, { connectionId: conn.id, sourceNode: sourceAudioNode, targetNode: toNativeInfo.allpassInternalNodes.inputPassthroughNode });
                    } catch (e) { console.error(`[AudioEngine Conn] Error connecting to Allpass internal nodes for ${conn.id}: ${(e as Error).message}`); }
                    targetAudioNodeOrParam = null; 
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
          console.error(`[AudioEngine Conn] Error making Web Audio connection for ID ${conn.id}: ${(e as Error).message}. From: ${fromDef.name}, To: ${toDef.name}`);
        }
      } else if (sourceAudioNode && targetAudioNodeOrParam === null && toDef.id === NATIVE_ALLPASS_FILTER_BLOCK_DEFINITION.id) {
          // Allpass connection already handled
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
    onStateChangeForReRender();
  }, [audioContext, isAudioGloballyEnabled, appLog, onStateChangeForReRender]);

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

  const listOutputDevices = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      appLog("[AudioEngine] enumerateDevices not supported.", true);
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOutputDevices = devices.filter(device => device.kind === 'audiooutput');
      setAvailableOutputDevices(audioOutputDevices);
    } catch (err) {
      appLog(`[AudioEngine] Error listing output devices: ${(err as Error).message}`, true);
    }
  }, [appLog, setAvailableOutputDevices]);

  const setOutputDevice = useCallback(async (sinkId: string): Promise<boolean> => {
    if (!audioContext || !(audioContext as any).setSinkId) {
      appLog("[AudioEngine] setSinkId is not supported by this browser or AudioContext not initialized.", true);
      return false;
    }
    try {
      if (masterGainNodeRef.current && audioContext.destination) {
        masterGainNodeRef.current.disconnect(audioContext.destination);
      }
      await (audioContext as any).setSinkId(sinkId);
      setSelectedSinkId(sinkId);
      appLog(`[AudioEngine] Audio output device set to: ${sinkId}`, true);
      if (masterGainNodeRef.current) {
        masterGainNodeRef.current.connect(audioContext.destination);
      }
      return true;
    } catch (err) {
      appLog(`[AudioEngine] Error setting output device: ${(err as Error).message}`, true);
      if (masterGainNodeRef.current && audioContext?.destination) {
        try { masterGainNodeRef.current.connect(audioContext.destination); }
        catch(e) { appLog(`[AudioEngine] Failed to fallback connect masterGain: ${(e as Error).message}`, true); }
      }
      return false;
    }
  }, [audioContext, appLog, setSelectedSinkId]);

  useEffect(() => {
    listOutputDevices(); 
    navigator.mediaDevices?.addEventListener('devicechange', listOutputDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', listOutputDevices);
    };
  }, [listOutputDevices]);

  const setupLyriaServiceForInstance = useCallback(async (
    instanceId: string, 
    definition: BlockDefinition,
    addBlockLog: (message: string) => void 
  ): Promise<boolean> => {
    if (!audioContext || audioContext.state !== 'running') {
      addBlockLog(`Lyria Service setup failed: AudioContext not ready (state: ${audioContext?.state}).`);
      return false;
    }
    if (!process.env.API_KEY) {
      addBlockLog("Lyria Service setup failed: API_KEY not configured.");
      return false;
    }
    if (managedLyriaServiceInstancesRef.current.has(instanceId)) {
      addBlockLog("Lyria Service already initialized for this block.");
      const existingServiceInfo = managedLyriaServiceInstancesRef.current.get(instanceId);
      if (existingServiceInfo && masterGainNodeRef.current && existingServiceInfo.outputNode !== masterGainNodeRef.current) {
        try { existingServiceInfo.outputNode.disconnect(); } catch(e) {/*ignore*/}
        existingServiceInfo.outputNode.connect(masterGainNodeRef.current);
      }
      return true;
    }

    const initialMusicConfig: Partial<LiveMusicGenerationConfig> = { ...DEFAULT_MUSIC_GENERATION_CONFIG };
    
    const serviceCallbacks: LiveMusicServiceCallbacks = {
      onPlaybackStateChange: (newState) => {
        addBlockLog(`Lyria playback state: ${newState}`);
        onStateChangeForReRender(); 
      },
      onFilteredPrompt: (promptInfo) => addBlockLog(`Lyria prompt filtered: "${promptInfo.text}", Reason: ${promptInfo.filteredReason}`),
      onSetupComplete: () => {
        addBlockLog("Lyria Service setup complete and ready.");
        onStateChangeForReRender();
      },
      onError: (error) => {
        addBlockLog(`Lyria Service Error: ${error}`);
        onStateChangeForReRender();
      },
      onClose: (message) => {
        addBlockLog(`Lyria Service closed: ${message}`);
        onStateChangeForReRender();
      },
      onOutputNodeChanged: (newNode) => {
        appLog(`[AudioEngine] Lyria Service output node changed for ${instanceId}. Updating connections.`, true);
        const lyriaServiceInfo = managedLyriaServiceInstancesRef.current.get(instanceId);

        if (lyriaServiceInfo && masterGainNodeRef.current) {
            const oldNode = lyriaServiceInfo.outputNode;
            managedLyriaServiceInstancesRef.current.set(instanceId, { ...lyriaServiceInfo, outputNode: newNode });

            if (oldNode && oldNode !== newNode) {
                try { oldNode.disconnect(masterGainNodeRef.current); } catch (e) { /* ignore */ }
            }
            try { newNode.connect(masterGainNodeRef.current); } 
            catch (e) { appLog(`[AudioEngine Error] Connecting new Lyria output for ${instanceId} to master gain: ${(e as Error).message}`, true); }
        } else if (masterGainNodeRef.current) {
            try { newNode.connect(masterGainNodeRef.current); } 
            catch (e) { appLog(`[AudioEngine Error] Connecting new Lyria output (no service info) for ${instanceId} to master gain: ${(e as Error).message}`, true); }
        }
        onStateChangeForReRender();
      },
    };

    try {
      const service = new LiveMusicService(process.env.API_KEY, audioContext, serviceCallbacks, initialMusicConfig);
      const lyriaOutputNode = service.getOutputNode();
      if (masterGainNodeRef.current) {
        lyriaOutputNode.connect(masterGainNodeRef.current);
      }
      managedLyriaServiceInstancesRef.current.set(instanceId, { instanceId, service, outputNode: lyriaOutputNode });
      addBlockLog("Lyria Service initialized and output connected.");
      await service.connect();
      onStateChangeForReRender();
      return true;
    } catch (error: any) {
      addBlockLog(`Failed to initialize Lyria Service: ${error.message}`);
      onStateChangeForReRender();
      return false;
    }
  }, [audioContext, appLog, onStateChangeForReRender]);
  
  const getLyriaServiceInstance = useCallback((instanceId: string): LiveMusicService | null => {
    return managedLyriaServiceInstancesRef.current.get(instanceId)?.service || null;
  }, []);
  
  const updateLyriaServiceState = useCallback((
    instanceId: string, 
    blockInternalState: Record<string, any>, 
    blockParams: Record<string, any>, 
    blockInputs: Record<string,any>,  
    clearRequestsFn: () => void 
  ) => {
    const service = getLyriaServiceInstance(instanceId);
    if (!service || !audioContext) return;

    if (blockInternalState.reconnectRequest) {
      service.reconnect();
    } else if (blockInternalState.stopRequest) {
      service.stop();
      if (blockInternalState.playRequest) { 
        service.play(blockInternalState.lastEffectivePrompts);
      }
    } else if (blockInternalState.playRequest) {
      service.play(blockInternalState.lastEffectivePrompts);
    } else if (blockInternalState.pauseRequest) {
      service.pause();
    }
    
    if (service.isConnected() || service.getPlaybackState() === 'paused') {
        if (blockInternalState.configUpdateNeeded) {
            const newConfig: Partial<LiveMusicGenerationConfig> = {};
            // Ensure GenAIScale is used as a value for Object.values
            // For GenAIScale, we check if the value is a valid member of the enum
            if (blockInputs.scale_cv_in !== undefined && blockInputs.scale_cv_in !== null && Object.values(GenAIScale).includes(blockInputs.scale_cv_in as any)) {
                newConfig.scale = blockInputs.scale_cv_in as GenAIScale; 
            } else if (blockParams.scale !== undefined && Object.values(GenAIScale).includes(blockParams.scale as any)) {
                newConfig.scale = blockParams.scale as GenAIScale;
            }
            
            if (blockInputs.brightness_cv_in !== undefined) newConfig.brightness = Number(blockInputs.brightness_cv_in);
            else if (blockParams.brightness !== undefined) newConfig.brightness = Number(blockParams.brightness);

            if (blockInputs.density_cv_in !== undefined) newConfig.density = Number(blockInputs.density_cv_in);
            else if (blockParams.density !== undefined) newConfig.density = Number(blockParams.density);

            if (blockInputs.seed_cv_in !== undefined) newConfig.seed = Math.floor(Number(blockInputs.seed_cv_in));
            else if (blockParams.seed !== undefined && Number(blockParams.seed) !== 0) newConfig.seed = Math.floor(Number(blockParams.seed));
            else if (blockParams.seed === 0) newConfig.seed = undefined; 
            
            if (blockInputs.temperature_cv_in !== undefined) newConfig.temperature = Number(blockInputs.temperature_cv_in);
            else if (blockParams.temperature !== undefined) newConfig.temperature = Number(blockParams.temperature);

            if (blockInputs.guidance_cv_in !== undefined) newConfig.guidance = Number(blockInputs.guidance_cv_in);
            else if (blockParams.guidance_scale !== undefined) newConfig.guidance = Number(blockParams.guidance_scale);
            
            if (blockInputs.top_k_cv_in !== undefined) newConfig.topK = Math.floor(Number(blockInputs.top_k_cv_in));
            else if (blockParams.top_k !== undefined) newConfig.topK = Math.floor(Number(blockParams.top_k));

            if (blockInputs.bpm_cv_in !== undefined) newConfig.bpm = Math.floor(Number(blockInputs.bpm_cv_in));
            else if (blockParams.bpm !== undefined) newConfig.bpm = Math.floor(Number(blockParams.bpm));
            
            service.setMusicGenerationConfig(newConfig);
        }
        
        if (blockInternalState.promptsUpdateNeeded) {
            service.setWeightedPrompts(blockInternalState.lastEffectivePrompts || []);
        }

        if (blockInternalState.trackMuteUpdateNeeded) {
            service.setMusicGenerationConfig({
                muteBass: !!blockInternalState.lastMuteBass,
                muteDrums: !!blockInternalState.lastMuteDrums,
                onlyBassAndDrums: !!blockInternalState.lastOnlyBassDrums,
            });
        }
    }

    clearRequestsFn(); 
    onStateChangeForReRender();
  }, [audioContext, getLyriaServiceInstance, onStateChangeForReRender]);

  useEffect(() => {
    return () => {
        if (audioContext && audioContext.state !== 'closed') {
            console.log("[AudioEngine] Cleaning up AudioContext on hook unmount.");
            managedWorkletNodesRef.current.forEach((_, id) => removeManagedAudioWorkletNode(id));
            managedNativeNodesRef.current.forEach((_, id) => removeManagedNativeNode(id));
            managedLyriaServiceInstancesRef.current.forEach((_, id) => removeLyriaServiceForInstance(id));
            
            if (masterGainNodeRef.current) {
                try { masterGainNodeRef.current.disconnect(); } catch(e) {}
            }
        }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 


  return {
    audioContext,
    masterGainNode: masterGainNodeRef.current,
    isAudioGloballyEnabled,
    isAudioWorkletSystemReady,
    audioInitializationError,
    toggleGlobalAudio,
    initializeBasicAudioContext,
    getSampleRate,
    setupManagedAudioWorkletNode,
    updateManagedAudioWorkletNodeParams,
    sendManagedAudioWorkletNodeMessage,
    removeManagedAudioWorkletNode,
    registerWorkletProcessor,
    setupManagedNativeNode,
    updateManagedNativeNodeParams,
    triggerNativeNodeEnvelope,
    triggerNativeNodeAttackHold,
    triggerNativeNodeRelease,
    removeManagedNativeNode,
    removeAllManagedNodes,
    getAnalyserNodeForInstance,
    updateAudioGraphConnections,
    requestSamplesFromWorklet,
    availableOutputDevices,
    selectedSinkId,
    listOutputDevices,
    setOutputDevice,
    setupLyriaServiceForInstance,
    removeLyriaServiceForInstance,
    getLyriaServiceInstance,
    updateLyriaServiceState,
  };
};
