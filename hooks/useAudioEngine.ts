
import { useEffect, useCallback, useRef } from 'react';
// import { Scale as GenAIScale } from '@google/genai'; // No longer needed
import { BlockDefinition, BlockParameter, Connection, BlockInstance, BlockPort, WeightedPrompt, LiveMusicGenerationConfig, Scale as AppScale } from '../types';
import { useAudioContextManager, InitAudioResult } from './useAudioContextManager';
import { useAudioWorkletManager, AudioWorkletManager } from './useAudioWorkletManager';
import { useNativeNodeManager, NativeNodeManager } from './useNativeNodeManager';
import { useLyriaServiceManager, LyriaServiceManager } from './useLyriaServiceManager';
import { useAudioDeviceManager, AudioDeviceManager } from './useAudioDeviceManager';
import { useAudioGraphConnector, AudioGraphConnector, ActiveWebAudioConnection } from './useAudioGraphConnector'; // Import new hook and types
import { 
    OSCILLATOR_BLOCK_DEFINITION, 
    AUDIO_OUTPUT_BLOCK_DEFINITION, 
    NATIVE_BIQUAD_FILTER_BLOCK_DEFINITION, 
    NATIVE_DELAY_BLOCK_DEFINITION, 
    GAIN_BLOCK_DEFINITION, 
    NATIVE_OSCILLATOR_BLOCK_DEFINITION, 
    OSCILLOSCOPE_BLOCK_DEFINITION, 
    NATIVE_LFO_BLOCK_DEFINITION, 
    NATIVE_LFO_BPM_SYNC_BLOCK_DEFINITION, // Used by NativeNodeManager
    NATIVE_AD_ENVELOPE_BLOCK_DEFINITION,
    NATIVE_AR_ENVELOPE_BLOCK_DEFINITION,
    NATIVE_ALLPASS_FILTER_BLOCK_DEFINITION,
    NUMBER_TO_CONSTANT_AUDIO_BLOCK_DEFINITION,
    LYRIA_MASTER_BLOCK_DEFINITION,
    // OSCILLOSCOPE_BLOCK_DEFINITION, // Removed duplicate
    // AUDIO_OUTPUT_BLOCK_DEFINITION, // Removed as it's only used in the deleted wrapper
} from '../constants';

export interface OscillatorWorkletParams {
  frequency: number;
  gain: number;
  waveform: 'sine' | 'square' | 'sawtooth' | 'triangle';
}

// ActiveWebAudioConnection is now in useAudioGraphConnector.ts

export interface AudioEngine {
  audioContext: AudioContext | null;
  masterGainNode: GainNode | null;
  isAudioGloballyEnabled: boolean;
  audioInitializationError: string | null;

  audioContextManager: AudioContextManager; // Added
  audioWorkletManager: AudioWorkletManager;
  nativeNodeManager: NativeNodeManager;
  lyriaServiceManager: LyriaServiceManager;
  audioDeviceManager: AudioDeviceManager;

  toggleGlobalAudio: () => Promise<boolean>;
  initializeBasicAudioContext: (logActivity?: boolean, forceNoResume?: boolean) => Promise<InitAudioResult>;
  getSampleRate: () => number | null;

  removeAllManagedNodes: () => void;
  updateAudioGraphConnections: (connections: Connection[], blockInstances: BlockInstance[], getDefinitionForBlock: (instance: BlockInstance) => BlockDefinition | undefined) => void;
  // setupManagedAudioWorkletNode removed from interface
}

export const useAudioEngine = (
    appLog: (message: string, isSystem?: boolean) => void,
    onStateChangeForReRender: () => void
): AudioEngine => {
  const audioContextManager = useAudioContextManager({
    appLog,
    onStateChangeForReRender,
  });

  const audioWorkletManager = useAudioWorkletManager({
    appLog,
    onStateChangeForReRender,
    audioContext: audioContextManager.audioContext,
  });

  const nativeNodeManager = useNativeNodeManager({
    appLog,
    onStateChangeForReRender,
    audioContext: audioContextManager.audioContext,
  });

  const lyriaServiceManager = useLyriaServiceManager({
    appLog,
    onStateChangeForReRender,
    audioContext: audioContextManager.audioContext,
    masterGainNode: audioContextManager.masterGainNode,
  });

  const audioDeviceManager = useAudioDeviceManager({
    appLog,
    onStateChangeForReRender,
    audioContext: audioContextManager.audioContext,
    masterGainNode: audioContextManager.masterGainNode,
  });
  
  const audioGraphConnector = useAudioGraphConnector({
    appLog, // Pass appLog if it might be used for debugging in the connector
    onStateChangeForReRender,
    audioContext: audioContextManager.audioContext,
    isAudioGloballyEnabled: audioContextManager.isAudioGloballyEnabled,
  });

  const {
    audioContext,
    masterGainNode,
    isAudioGloballyEnabled, // This is the reactive state value
    audioInitializationError,
    initializeBasicAudioContext: initContextInternal, // This is the stable function
    toggleGlobalAudio: toggleGlobalAudioInternal,     // This is the stable function
    getSampleRate: getCtxSampleRate,                 // This is the stable function
    isAudioGloballyEnabled: managerIsAudioGloballyEnabled, // Destructured reactive state
    audioContext: managerAudioContext                     // Destructured reactive state (or current value)
  } = audioContextManager;

  const {
    checkAndRegisterPredefinedWorklets,
    setIsAudioWorkletSystemReady,
    removeAllManagedWorkletNodes // For removeAllManagedNodes callback
  } = audioWorkletManager;

  const { listOutputDevices: listDev } = audioDeviceManager;
  const { removeAllManagedNativeNodes } = nativeNodeManager; // For removeAllManagedNodes
  const { removeAllManagedLyriaServices } = lyriaServiceManager; // For removeAllManagedNodes
  const { updateAudioGraphConnections: updateConnectionsInternal } = audioGraphConnector; // For updateAudioGraphConnections

  // activeWebAudioConnectionsRef is now managed by useAudioGraphConnector

  const initializeBasicAudioContext = useCallback(async (logActivity: boolean = true, forceNoResume: boolean = false): Promise<InitAudioResult> => {
    const contextResult = await initContextInternal(logActivity, forceNoResume);
    if (contextResult.context && contextResult.context.state === 'running') {
      const workletsReady = await checkAndRegisterPredefinedWorklets(logActivity);
      setIsAudioWorkletSystemReady(workletsReady);
    } else {
      setIsAudioWorkletSystemReady(false);
    }
    await listDev();
    return contextResult;
  }, [initContextInternal, checkAndRegisterPredefinedWorklets, setIsAudioWorkletSystemReady, listDev]);

  const toggleGlobalAudio = useCallback(async (): Promise<boolean> => {
    const audioEnabledSuccessfully = await toggleGlobalAudioInternal();
    // Use the destructured managerIsAudioGloballyEnabled and managerAudioContext for checks
    if (managerAudioContext && managerIsAudioGloballyEnabled && audioEnabledSuccessfully) {
      if (managerAudioContext.state === 'running') {
        const workletsReady = await checkAndRegisterPredefinedWorklets(true);
        setIsAudioWorkletSystemReady(workletsReady);
      } else {
        setIsAudioWorkletSystemReady(false);
      }
    } else {
      setIsAudioWorkletSystemReady(false);
    }
    return managerIsAudioGloballyEnabled && audioEnabledSuccessfully;
  }, [toggleGlobalAudioInternal, managerIsAudioGloballyEnabled, managerAudioContext, checkAndRegisterPredefinedWorklets, setIsAudioWorkletSystemReady]);

  const getSampleRate = useCallback((): number | null => {
    return getCtxSampleRate();
  }, [getCtxSampleRate]);

  // setupManagedAudioWorkletNode useCallback wrapper removed.

  const removeAllManagedNodes = useCallback(() => {
    removeAllManagedWorkletNodes();
    removeAllManagedNativeNodes();
    removeAllManagedLyriaServices();
    appLog("[AudioEngine] All managed nodes removal signaled.", true);
    onStateChangeForReRender();
  }, [removeAllManagedWorkletNodes, removeAllManagedNativeNodes, removeAllManagedLyriaServices, onStateChangeForReRender, appLog]);


  const updateAudioGraphConnections = useCallback((
    connections: Connection[],
    blockInstances: BlockInstance[],
    getDefinitionForBlock: (instance: BlockInstance) => BlockDefinition | undefined
  ) => {
    updateConnectionsInternal( // from audioGraphConnector
      connections,
      blockInstances,
      getDefinitionForBlock,
      audioWorkletManager.managedWorkletNodesRef.current,
      nativeNodeManager.managedNativeNodesRef.current,
      lyriaServiceManager.managedLyriaServiceInstancesRef.current
    );
  }, [updateConnectionsInternal, audioWorkletManager, nativeNodeManager, lyriaServiceManager]);
  // Manager objects are kept as deps because their refs' .current property is accessed.

  useEffect(() => {
    return () => {
        // Cleanup for all managers if the main engine unmounts
        // Use managerAudioContext here as well for consistency if it represents the latest context for cleanup
        if (managerAudioContext && managerAudioContext.state !== 'closed') {
            console.log("[AudioEngine] Cleaning up all managed nodes on hook unmount.");
            removeAllManagedWorkletNodes(); // Use destructured stable functions
            removeAllManagedNativeNodes();  // Use destructured stable functions
            removeAllManagedLyriaServices();// Use destructured stable functions
        }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [managerAudioContext, removeAllManagedWorkletNodes, removeAllManagedNativeNodes, removeAllManagedLyriaServices]);


  return {
    audioContext: audioContextManager.audioContext,
    masterGainNode: audioContextManager.masterGainNode,
    isAudioGloballyEnabled: audioContextManager.isAudioGloballyEnabled,
    audioInitializationError: audioContextManager.audioInitializationError,

    audioContextManager: audioContextManager, // Added
    audioWorkletManager,
    nativeNodeManager,
    lyriaServiceManager,
    audioDeviceManager,

    initializeBasicAudioContext,
    toggleGlobalAudio,
    getSampleRate,

    removeAllManagedNodes,
    updateAudioGraphConnections,
  };
};
