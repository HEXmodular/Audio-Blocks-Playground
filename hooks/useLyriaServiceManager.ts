import { useEffect, useMemo, useCallback, useState } from 'react';
import { BlockDefinition, LiveMusicGenerationConfig, WeightedPrompt } from '../types';
import { LyriaServiceManager as LyriaServiceManagerClass } from '../services/LyriaServiceManager';
import type { ILyriaServiceManager, ManagedLyriaServiceInfo } from '../services/LyriaServiceManager';

import { LiveMusicService } from '../services/LiveMusicService'; // PlaybackState might be needed for types exposed by the hook
import type { PlaybackState } from '../services/LiveMusicService';
// Re-exporting or defining related types if they are part of the hook's public API
export { ManagedLyriaServiceInfo, ILyriaServiceManager as LyriaServiceManager, LiveMusicService, PlaybackState };

interface UseLyriaServiceManagerProps {
  appLog: (message: string, isSystem?: boolean) => void;
  onStateChangeForReRender: () => void;
  audioContext: AudioContext | null;
  masterGainNode: GainNode | null;
}

export const useLyriaServiceManager = ({
  appLog,
  onStateChangeForReRender,
  audioContext,
  masterGainNode,
}: UseLyriaServiceManagerProps): ILyriaServiceManager => {
  // The hook itself might not need to maintain much state if the class handles it.
  // However, if the class's state changes need to trigger re-renders of the component using the hook,
  // the onStateChangeForReRender callback passed to the class should be used by the class to signal this.
  // The hook can then simply be a conduit to the class instance.

  const managerInstance = useMemo(() => {
    return new LyriaServiceManagerClass(
      audioContext,
      masterGainNode,
      onStateChangeForReRender, // Pass this down for the class to trigger updates
      appLog
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appLog, onStateChangeForReRender]); // Initial context/gain node are passed, then updated via useEffect

  useEffect(() => {
    managerInstance._setAudioContextAndMasterGain(audioContext, masterGainNode);
  }, [audioContext, masterGainNode, managerInstance]);

  // Expose methods and potentially properties from the class instance.
  // The ILyriaServiceManager interface should align with what the hook needs to expose.
  return {
    setupLyriaServiceForInstance: managerInstance.setupLyriaServiceForInstance.bind(managerInstance),
    removeLyriaServiceForInstance: managerInstance.removeLyriaServiceForInstance.bind(managerInstance),
    getLyriaServiceInstance: managerInstance.getLyriaServiceInstance.bind(managerInstance),
    updateLyriaServiceState: managerInstance.updateLyriaServiceState.bind(managerInstance),
    removeAllManagedLyriaServices: managerInstance.removeAllManagedLyriaServices.bind(managerInstance),
    // The managedLyriaServiceInstancesRef is internal to the class.
    // The class now has getManagedInstancesMap().
    // If the hook's consumers need this map, the interface ILyriaServiceManager would need to expose it,
    // possibly by adding: getManagedInstancesMap: () => Map<string, ManagedLyriaServiceInfo>;
    // For now, assuming direct ref exposure is not part of the public API from the hook.
  };
};
