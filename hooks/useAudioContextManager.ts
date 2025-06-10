import { useState, useCallback, useRef, useEffect } from 'react';
import { AudioContextState } from '../types';
import { AudioContextService, InitAudioResult as ServiceInitAudioResult } from '../services/AudioContextService'; // Import service and its result type

// Exporting the same interface for the hook's return type
export interface InitAudioResult extends ServiceInitAudioResult {} // Re-export for compatibility

export interface AudioContextManager {
  audioContext: AudioContext | null;
  masterGainNode: GainNode | null;
  isAudioGloballyEnabled: boolean;
  audioInitializationError: string | null;
  initializeBasicAudioContext: (logActivity?: boolean, forceNoResume?: boolean) => Promise<InitAudioResult>;
  toggleGlobalAudio: () => Promise<boolean>;
  getSampleRate: () => number | null;
  // Expose context state if needed by consumers directly, though isAudioGloballyEnabled often covers UI needs
  getAudioContextState: () => AudioContextState | null;
}

interface UseAudioContextManagerProps {
  appLog: (message: string, isSystem?: boolean) => void;
  onStateChangeForReRender: () => void;
}

export const useAudioContextManager = ({
  appLog,
  onStateChangeForReRender,
}: UseAudioContextManagerProps): AudioContextManager => {
  const [isAudioGloballyEnabled, _setIsAudioGloballyEnabled] = useState(false);
  const [audioInitializationError, _setAudioInitializationError] = useState<string | null>(null);

  // Callback for the service to notify of AudioContext state changes
  const handleContextStateChange = useCallback((newState: AudioContextState) => {
    // This callback could be used to trigger re-renders or update other state
    // For example, if the context is externally suspended or closed.
    appLog(`[useAudioContextManager] Received context state change: ${newState}`, true);
    if (newState === 'closed' || newState === 'suspended') {
        if (isAudioGloballyEnabled) { // If we thought audio was on, but context closed/suspended externally
            _setIsAudioGloballyEnabled(false);
            // Potentially set an error or informational message
            // _setAudioInitializationError("AudioContext was externally closed or suspended.");
        }
    }
    onStateChangeForReRender(); // Continue to call this for now
  }, [appLog, onStateChangeForReRender, isAudioGloballyEnabled]);

  const serviceRef = useRef<AudioContextService | null>(null);
  if (serviceRef.current === null) {
    serviceRef.current = new AudioContextService(appLog, handleContextStateChange);
  }
  const service = serviceRef.current;

  const setIsAudioGloballyEnabled = useCallback((enabled: boolean) => {
    _setIsAudioGloballyEnabled(enabled);
    onStateChangeForReRender();
  }, [onStateChangeForReRender]);

  const setAudioInitializationError = useCallback((error: string | null) => {
    _setAudioInitializationError(error);
    onStateChangeForReRender();
  }, [onStateChangeForReRender]);

  const initializeBasicAudioContext = useCallback(async (logActivity: boolean = true, forceNoResume: boolean = false): Promise<InitAudioResult> => {
    // logActivity is implicitly handled by appLog passed to service.
    // No need to pass it to service.initialize.
    const result = await service.initialize(forceNoResume);
    if (!result.context) {
      setAudioInitializationError(audioInitializationError || "AudioContext initialization failed in service.");
    } else {
      setAudioInitializationError(null); // Clear previous errors on successful init
    }
    // The hook's state (audioContext, masterGainNode) will be updated via getters
    onStateChangeForReRender(); // Ensure UI updates with new context from service
    return { context: service.getAudioContext(), contextJustResumed: result.contextJustResumed };
  }, [service, audioInitializationError, setAudioInitializationError, onStateChangeForReRender]);

  const toggleGlobalAudio = useCallback(async (): Promise<boolean> => {
    setAudioInitializationError(null);
    let currentServiceContext = service.getAudioContext();

    if (isAudioGloballyEnabled) { // If currently enabled, we want to disable
      await service.suspendContext();
      setIsAudioGloballyEnabled(false);
      appLog(`[useAudioContextManager Toggle] Audio globally DISABLED. Context state: ${service.getContextState()}`, true);
      return true; // Successfully disabled (or was already)
    } else { // If currently disabled, we want to enable
      // Ensure context is initialized first
      if (!currentServiceContext || currentServiceContext.state === 'closed') {
        appLog("[useAudioContextManager Toggle] No context or context closed, initializing...", true);
        const initResult = await service.initialize(false); // forceNoResume = false
        currentServiceContext = initResult.context;
        if (!currentServiceContext) {
          setIsAudioGloballyEnabled(false);
          setAudioInitializationError(audioInitializationError || "AudioContext creation/retrieval failed in toggleGlobalAudio.");
          appLog("[useAudioContextManager Toggle] Failed to initialize AudioContext for enabling.", true);
          return false;
        }
      }

      // If context is suspended, try to resume
      if (currentServiceContext.state === 'suspended') {
        appLog("[useAudioContextManager Toggle] Context is suspended, attempting resume...", true);
        await service.resumeContext();
      }

      // Check final state
      if (service.getContextState() === 'running') {
        setIsAudioGloballyEnabled(true);
        appLog(`[useAudioContextManager Toggle] Audio globally ENABLED. Context state: ${service.getContextState()}`, true);
        return true;
      } else {
        setIsAudioGloballyEnabled(false);
        const errMsg = `Failed to enable audio. Context state: ${service.getContextState()}.`;
        setAudioInitializationError(audioInitializationError || errMsg);
        appLog(`[useAudioContextManager Toggle] ${errMsg}`, true);
        return false;
      }
    }
  }, [isAudioGloballyEnabled, service, setIsAudioGloballyEnabled, setAudioInitializationError, appLog, audioInitializationError]);

  const getSampleRate = useCallback((): number | null => {
    return service.getSampleRate();
  }, [service]);

  const getAudioContextState = useCallback((): AudioContextState | null => {
    return service.getContextState();
  }, [service]);

  // Effect for cleaning up the service's AudioContext on unmount
  useEffect(() => {
    return () => {
      appLog("[useAudioContextManager] Unmounting. Cleaning up AudioContextService.", true);
      service.cleanupContext();
    };
  }, [service, appLog]); // service and appLog are stable

  return {
    audioContext: service.getAudioContext(), // Get current context from service
    masterGainNode: service.getMasterGainNode(), // Get current gain from service
    isAudioGloballyEnabled,
    audioInitializationError,
    initializeBasicAudioContext,
    toggleGlobalAudio,
    getSampleRate,
    getAudioContextState,
  };
};
