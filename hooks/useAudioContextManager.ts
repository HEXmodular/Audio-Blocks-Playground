import { useState, useCallback, useRef } from 'react';
import { AudioContextState } from '../types'; // BlockDefinition no longer needed here

export interface InitAudioResult {
  context: AudioContext | null;
  contextJustResumed?: boolean; // Indicates if an existing context was resumed
  // workletsReady is removed as it's now managed by useAudioWorkletManager
}

export interface AudioContextManager {
  audioContext: AudioContext | null;
  masterGainNode: GainNode | null;
  isAudioGloballyEnabled: boolean;
  audioInitializationError: string | null;
  initializeBasicAudioContext: (logActivity?: boolean, forceNoResume?: boolean) => Promise<InitAudioResult>;
  toggleGlobalAudio: () => Promise<boolean>; // Returns success of audio enabling/disabling itself
  getSampleRate: () => number | null;
}

interface UseAudioContextManagerProps {
  appLog: (message: string, isSystem?: boolean) => void;
  onStateChangeForReRender: () => void;
  // predefinedWorkletDefinitions and registeredWorkletNamesRef are removed
}

export const useAudioContextManager = ({
  appLog,
  onStateChangeForReRender,
}: UseAudioContextManagerProps): AudioContextManager => {
  const [audioContext, _setAudioContext] = useState<AudioContext | null>(null);
  const masterGainNodeRef = useRef<GainNode | null>(null);
  const [isAudioGloballyEnabled, _setIsAudioGloballyEnabled] = useState(false);
  const [audioInitializationError, _setAudioInitializationError] = useState<string | null>(null);

  const setAudioContext = useCallback((ctx: AudioContext | null) => {
    _setAudioContext(ctx);
    onStateChangeForReRender();
  }, [onStateChangeForReRender]);

  const setIsAudioGloballyEnabled = useCallback((enabled: boolean) => {
    _setIsAudioGloballyEnabled(enabled);
    onStateChangeForReRender();
  }, [onStateChangeForReRender]);

  const setAudioInitializationError = useCallback((error: string | null) => {
    _setAudioInitializationError(error);
    onStateChangeForReRender();
  }, [onStateChangeForReRender]);

  // registerWorkletProcessor and checkAndRegisterPredefinedWorklets are removed.
  // They are now managed by useAudioWorkletManager.

  const initializeBasicAudioContext = useCallback(async (logActivity: boolean = true, forceNoResume: boolean = false): Promise<InitAudioResult> => {
    let localContextRef = audioContext;
    let contextJustResumed = false;
    let contextErrorMessage: string | null = null;

    if (localContextRef && localContextRef.state === 'closed') {
      if (logActivity) appLog("[AudioContextManager Init] Existing AudioContext was 'closed'. Creating new one.", true);
      localContextRef = null; // Force creation of a new context
    }

    if (localContextRef) {
      if (logActivity) appLog(`[AudioContextManager Init] Existing AudioContext found (state: ${localContextRef.state}).`, true);
      const currentStateOfExistingContext: AudioContextState = localContextRef.state;
      if (currentStateOfExistingContext === 'suspended' && !forceNoResume) {
        if (logActivity) appLog("[AudioContextManager Init] Attempting to resume existing suspended context...", true);
        try {
          await localContextRef.resume();
          contextJustResumed = true; // Mark that resume was attempted and successful (state will confirm)
          if (logActivity) appLog(`[AudioContextManager Init] Resume attempt finished. Context state: ${localContextRef.state}.`, true);
        } catch (resumeError) {
          if (logActivity) appLog(`[AudioContextManager Init Error] Error resuming existing context: ${(resumeError as Error).message}`, true);
          contextErrorMessage = `Error resuming context: ${(resumeError as Error).message}`;
        }
      }
      // Worklet registration is no longer handled here.
    } else {
      if (logActivity) appLog(audioContext ? "[AudioContextManager Init] Existing context was closed. Creating new." : "[AudioContextManager Init] No existing context. Creating new.", true);
      try {
        const newContext = new AudioContext();
        if (logActivity) appLog(`[AudioContextManager Init] New AudioContext created (initial state: ${newContext.state}).`, true);

        if (masterGainNodeRef.current) {
          try { masterGainNodeRef.current.disconnect(); } catch (e) { /* ignore */ }
        }
        masterGainNodeRef.current = newContext.createGain();
        masterGainNodeRef.current.connect(newContext.destination);

        setAudioContext(newContext);
        localContextRef = newContext; // Update localContextRef to the new context

        // If new context is suspended, attempt to resume it (unless forceNoResume is true)
        if (localContextRef.state === 'suspended' && !forceNoResume) {
          if (logActivity) appLog("[AudioContextManager Init] New context is suspended. Attempting resume...", true);
          await localContextRef.resume();
          contextJustResumed = true; // Mark that resume was attempted
          if (logActivity) appLog(`[AudioContextManager Init] Resume attempt finished. New context state: ${localContextRef.state}.`, true);
        }
        // Worklet registration is no longer handled here.
      } catch (creationError) {
        const errorMsg = `Critical Error initializing new AudioContext: ${(creationError as Error).message}`;
        if (logActivity) appLog(`[AudioContextManager Init Critical Error] ${errorMsg}`, true);
        contextErrorMessage = errorMsg;
        setAudioContext(null); // Ensure context is null on error
        localContextRef = null; // Ensure local ref is also null
      }
    }

    if (contextErrorMessage && !audioInitializationError) {
      setAudioInitializationError(contextErrorMessage);
    }
    // workletsReady is removed from return, contextJustResumed is added.
    return { context: localContextRef, contextJustResumed: contextJustResumed && localContextRef?.state === 'running' };
  }, [audioContext, audioInitializationError, appLog, setAudioContext, setAudioInitializationError]);

  const toggleGlobalAudio = useCallback(async (): Promise<boolean> => {
    setAudioInitializationError(null);
    // initializeBasicAudioContext no longer returns workletsReady directly in its InitAudioResult
    const { context: localAudioContextRef, contextJustResumed } = await initializeBasicAudioContext(true, false);

    if (!localAudioContextRef) {
      setIsAudioGloballyEnabled(false);
      setAudioInitializationError(audioInitializationError || "AudioContext creation/retrieval failed in toggleGlobalAudio.");
      appLog("[AudioContextManager Toggle] Failed to get/create AudioContext.", true);
      return false; // Indicate failure to enable/disable audio
    }

    let currentContextState = localAudioContextRef.state;

    // If context was just resumed and is not running, it's an issue.
    if (contextJustResumed && currentContextState !== 'running') {
        setIsAudioGloballyEnabled(false);
        setAudioInitializationError(audioInitializationError || "Context did not become 'running' after resume attempt.");
        appLog(`[AudioContextManager Toggle] Context state is '${currentContextState}' after resume. Audio NOT enabled.`, true);
        return false;
    }

    // If context is suspended (and wasn't just successfully resumed to 'running')
    if (currentContextState === 'suspended' && !contextJustResumed) {
      appLog(`[AudioContextManager Toggle] Context is suspended. Attempting resume.`, true);
      try {
        await localAudioContextRef.resume();
        currentContextState = localAudioContextRef.state; // Re-read state
        if (currentContextState !== 'running') {
            setIsAudioGloballyEnabled(false);
            setAudioInitializationError(audioInitializationError || "Context remained suspended after resume attempt.");
            appLog(`[AudioContextManager Toggle] Context state is '${currentContextState}' after resume. Audio NOT enabled.`, true);
            return false;
        }
        appLog(`[AudioContextManager Toggle] Resume successful. Context state: ${currentContextState}.`, true);
      } catch (resumeError) {
        appLog(`[AudioContextManager Toggle] Error resuming AudioContext: ${(resumeError as Error).message}`, true);
        setIsAudioGloballyEnabled(false);
        setAudioInitializationError(audioInitializationError || `Resume error: ${(resumeError as Error).message}`);
        return false;
      }
    } else if (currentContextState === 'closed') {
      // This case should ideally be handled by initializeBasicAudioContext creating a new one.
      // If we reach here, it means re-initialization within toggle itself might be needed or an error occurred.
      appLog(`[AudioContextManager Toggle] Context is closed. This should have been handled by initializeBasicAudioContext.`, true);
      setIsAudioGloballyEnabled(false);
      setAudioInitializationError(audioInitializationError || "Context is closed, cannot proceed.");
      return false;
    }

    // Now, perform the toggle action based on the current global state
    if (isAudioGloballyEnabled) {
      // Currently enabled, so disable it
      if (localAudioContextRef.state === 'running') {
        appLog(`[AudioContextManager Toggle] Suspending AudioContext (was running).`, true);
        await localAudioContextRef.suspend();
      }
      setIsAudioGloballyEnabled(false);
      appLog(`[AudioContextManager Toggle] Audio globally DISABLED. Context state: ${localAudioContextRef.state}.`, true);
    } else {
      // Currently disabled, so enable it
      // Context should be running at this point (either initially or after resume)
      if (localAudioContextRef.state === 'running') {
        setIsAudioGloballyEnabled(true);
        appLog(`[AudioContextManager Toggle] Audio globally ENABLED. Context state: ${localAudioContextRef.state}.`, true);
      } else {
        // This shouldn't happen if logic above is correct
        appLog(`[AudioContextManager Toggle] Cannot enable audio: Context not running (State: ${localAudioContextRef.state}).`, true);
        setIsAudioGloballyEnabled(false);
        setAudioInitializationError(audioInitializationError || "Cannot enable audio, context not running.");
        return false; // Failed to enable
      }
    }
    return true; // Successfully toggled the intended state
  }, [isAudioGloballyEnabled, initializeBasicAudioContext, appLog, setIsAudioGloballyEnabled, setAudioInitializationError, audioInitializationError]);

  const getSampleRate = useCallback((): number | null => {
    return audioContext?.sampleRate || null;
  }, [audioContext]);

  return {
    audioContext,
    masterGainNode: masterGainNodeRef.current,
    isAudioGloballyEnabled,
    audioInitializationError,
    initializeBasicAudioContext,
    toggleGlobalAudio,
    getSampleRate,
    // registerWorkletProcessor and checkAndRegisterPredefinedWorklets are removed from export
  };
};
