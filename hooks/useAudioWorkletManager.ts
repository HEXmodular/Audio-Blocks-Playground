import { useState, useEffect, useMemo, useCallback, RefObject } from 'react';
import { BlockDefinition, BlockParameter, AudioContextState } from '../types';
import { AudioWorkletManager as AudioWorkletManagerClass } from '../services/AudioWorkletManager';
import type {IAudioWorkletManager, ManagedWorkletNodeInfo} from '../services/AudioWorkletManager';


// Re-exporting or defining related types if they are part of the hook's public API
export { ManagedWorkletNodeInfo, IAudioWorkletManager as AudioWorkletManager }; // Exporting IAudioWorkletManager as AudioWorkletManager for the hook's return type

interface UseAudioWorkletManagerProps {
  onStateChangeForReRender: () => void;
  audioContext: AudioContext | null;
}

export const useAudioWorkletManager = ({
  onStateChangeForReRender,
  audioContext,
}: UseAudioWorkletManagerProps): IAudioWorkletManager => { // Return the interface
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Memoize the class instance
  const managerInstance = useMemo(() => {
    return new AudioWorkletManagerClass(audioContext, () => {
      // This callback will be triggered by the class instance when its internal state changes
      // that requires a React re-render (e.g. isAudioWorkletSystemReady, audioInitializationErrorLocal)
      setIsReady(managerInstance.isAudioWorkletSystemReady);
      setError(managerInstance.audioInitializationErrorLocal);
      onStateChangeForReRender(); // Propagate re-render request
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // audioContext is handled by useEffect below, onStateChangeForReRender is stable

  // Update audioContext in the class instance when the prop changes
  useEffect(() => {
    managerInstance._setAudioContext(audioContext);
    // After context update, refresh local state derived from the manager
    setIsReady(managerInstance.isAudioWorkletSystemReady);
    setError(managerInstance.audioInitializationErrorLocal);
  }, [audioContext, managerInstance]);

  // Expose methods directly from the class instance
  // The hook's role is now primarily to manage the lifecycle and React-specific state updates.
  return {
    isAudioWorkletSystemReady: isReady,
    // This setter on the hook might still be needed if AudioEngine directly calls it on the hook instance.
    // Otherwise, the class manages its internal state.
    setIsAudioWorkletSystemReady: useCallback((ready: boolean) => {
        managerInstance.setIsAudioWorkletSystemReady(ready);
        setIsReady(ready); // Keep local state in sync
    }, [managerInstance]),
    registerWorkletProcessor: managerInstance.registerWorkletProcessor.bind(managerInstance),
    checkAndRegisterPredefinedWorklets: managerInstance.checkAndRegisterPredefinedWorklets.bind(managerInstance),
    setupManagedAudioWorkletNode: managerInstance.setupManagedAudioWorkletNode.bind(managerInstance),
    updateManagedAudioWorkletNodeParams: managerInstance.updateManagedAudioWorkletNodeParams.bind(managerInstance),
    sendManagedAudioWorkletNodeMessage: managerInstance.sendManagedAudioWorkletNodeMessage.bind(managerInstance),
    removeManagedAudioWorkletNode: managerInstance.removeManagedAudioWorkletNode.bind(managerInstance),
    removeAllManagedWorkletNodes: managerInstance.removeAllManagedWorkletNodes.bind(managerInstance),
    requestSamplesFromWorklet: managerInstance.requestSamplesFromWorklet.bind(managerInstance),
    // Expose the error state from the class instance
    audioInitializationErrorLocal: error,
    // The managedWorkletNodesRef is internal to the class.
    // If direct access to the map is needed, the class should provide a getter.
    // The class now has getManagedNodesMap().
    // Let's assume the hook's public API doesn't need to expose the RefObject directly.
    // If a component needs the map, it should be obtained via a method on the managerInstance.
    // For now, removing `managedWorkletNodesRef` from the return, assuming `getManagedNodesMap()` on the class is sufficient if access is needed elsewhere.
  };
};
