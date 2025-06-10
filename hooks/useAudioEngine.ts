
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
    OSCILLOSCOPE_BLOCK_DEFINITION,
    // AUDIO_OUTPUT_BLOCK_DEFINITION is used by setupManagedAudioWorkletNode wrapper, ensure it's imported if needed
    AUDIO_OUTPUT_BLOCK_DEFINITION,
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

  audioWorkletManager: AudioWorkletManager;
  nativeNodeManager: NativeNodeManager;
  lyriaServiceManager: LyriaServiceManager;
  audioDeviceManager: AudioDeviceManager;

  toggleGlobalAudio: () => Promise<boolean>;
  initializeBasicAudioContext: (logActivity?: boolean, forceNoResume?: boolean) => Promise<InitAudioResult>;
  getSampleRate: () => number | null;

  removeAllManagedNodes: () => void;
  // This signature matches what App.tsx expects
  updateAudioGraphConnections: (connections: Connection[], blockInstances: BlockInstance[], getDefinitionForBlock: (instance: BlockInstance) => BlockDefinition | undefined) => void;
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
    isAudioGloballyEnabled,
    audioInitializationError,
  } = audioContextManager;

  // activeWebAudioConnectionsRef is now managed by useAudioGraphConnector

  const initializeBasicAudioContext = useCallback(async (logActivity: boolean = true, forceNoResume: boolean = false): Promise<InitAudioResult> => {
    const contextResult = await audioContextManager.initializeBasicAudioContext(logActivity, forceNoResume);
    if (contextResult.context && contextResult.context.state === 'running') {
      const workletsReady = await audioWorkletManager.checkAndRegisterPredefinedWorklets(logActivity);
      audioWorkletManager.setIsAudioWorkletSystemReady(workletsReady);
    } else {
      audioWorkletManager.setIsAudioWorkletSystemReady(false);
    }
    await audioDeviceManager.listOutputDevices();
    return contextResult;
  }, [audioContextManager, audioWorkletManager, audioDeviceManager]);

  const toggleGlobalAudio = useCallback(async (): Promise<boolean> => {
    const audioEnabledSuccessfully = await audioContextManager.toggleGlobalAudio();
    if (audioContextManager.audioContext && audioContextManager.isAudioGloballyEnabled && audioEnabledSuccessfully) {
      if (audioContextManager.audioContext.state === 'running') {
        const workletsReady = await audioWorkletManager.checkAndRegisterPredefinedWorklets(true);
        audioWorkletManager.setIsAudioWorkletSystemReady(workletsReady);
      } else {
        audioWorkletManager.setIsAudioWorkletSystemReady(false);
      }
    } else {
      audioWorkletManager.setIsAudioWorkletSystemReady(false);
    }
    return audioContextManager.isAudioGloballyEnabled && audioEnabledSuccessfully;
  }, [audioContextManager, audioWorkletManager]);

  const getSampleRate = useCallback((): number | null => {
    return audioContextManager.getSampleRate();
  }, [audioContextManager]);

   const setupManagedAudioWorkletNode = useCallback(async (
    instanceId: string,
    definition: BlockDefinition,
    initialParams: BlockParameter[]
  ): Promise<boolean> => {
    const success = await audioWorkletManager.setupManagedAudioWorkletNode(instanceId, definition, initialParams);
    if (success && definition.id === AUDIO_OUTPUT_BLOCK_DEFINITION.id) {
        const workletInfo = audioWorkletManager.managedWorkletNodesRef.current?.get(instanceId);
        if (workletInfo?.node && masterGainNode) {
            try {
                workletInfo.node.connect(masterGainNode);
                 appLog(`[AudioEngine] Output worklet '${instanceId}' connected to master gain.`, true);
            } catch (e: any) {
                appLog(`[AudioEngine Error] Connecting output worklet '${instanceId}' to master gain: ${e.message}`, true);
                return false;
            }
        }
    }
    return success;
  }, [audioWorkletManager, masterGainNode, appLog]);


  const removeAllManagedNodes = useCallback(() => {
    audioWorkletManager.removeAllManagedWorkletNodes();
    nativeNodeManager.removeAllManagedNativeNodes();
    lyriaServiceManager.removeAllManagedLyriaServices();
    appLog("[AudioEngine] All managed nodes removal signaled.", true);
    onStateChangeForReRender();
  }, [audioWorkletManager, nativeNodeManager, lyriaServiceManager, onStateChangeForReRender]);


  const updateAudioGraphConnections = useCallback((
    connections: Connection[],
    blockInstances: BlockInstance[],
    getDefinitionForBlock: (instance: BlockInstance) => BlockDefinition | undefined
  ) => {
    // Call the connector's update function, passing all necessary data from other managers
    audioGraphConnector.updateAudioGraphConnections(
      connections,
      blockInstances,
      getDefinitionForBlock,
      audioWorkletManager.managedWorkletNodesRef.current,
      nativeNodeManager.managedNativeNodesRef.current,
      lyriaServiceManager.managedLyriaServiceInstancesRef.current
    );
  }, [audioGraphConnector, audioWorkletManager, nativeNodeManager, lyriaServiceManager]); // Add other managers if their refs are needed by the connector


  useEffect(() => {
    return () => {
        // Cleanup for all managers if the main engine unmounts
        if (audioContextManager.audioContext && audioContextManager.audioContext.state !== 'closed') {
            console.log("[AudioEngine] Cleaning up all managed nodes on hook unmount.");
            audioWorkletManager.removeAllManagedWorkletNodes();
            nativeNodeManager.removeAllManagedNativeNodes();
            lyriaServiceManager.removeAllManagedLyriaServices();
        }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioContextManager.audioContext, audioWorkletManager, nativeNodeManager, lyriaServiceManager]); // Add audioDeviceManager if it had a cleanup


  return {
    audioContext: audioContextManager.audioContext,
    masterGainNode: audioContextManager.masterGainNode,
    isAudioGloballyEnabled: audioContextManager.isAudioGloballyEnabled,
    audioInitializationError: audioContextManager.audioInitializationError,

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
