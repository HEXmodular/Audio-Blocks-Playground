import { useEffect, useMemo, useCallback, RefObject } from 'react'; // Added RefObject
import { BlockDefinition, BlockParameter } from '../types';
import { NativeNodeManager as NativeNodeManagerClass } from '../services/NativeNodeManager';
import type { INativeNodeManager, ManagedNativeNodeInfo } from '../services/NativeNodeManager';

import type {AllpassInternalNodes } from '../services/NativeNodeManager';
// Re-export types needed by consumers of the hook
export { ManagedNativeNodeInfo, AllpassInternalNodes, INativeNodeManager as NativeNodeManager };

interface UseNativeNodeManagerProps {
  appLog: (message: string, isSystem?: boolean) => void;
  onStateChangeForReRender: () => void;
  audioContext: AudioContext | null;
}

export const useNativeNodeManager = ({
  appLog,
  onStateChangeForReRender,
  audioContext,
}: UseNativeNodeManagerProps): INativeNodeManager => { // Return the interface

  const managerInstance = useMemo(() => {
    return new NativeNodeManagerClass(
      audioContext,
      onStateChangeForReRender,
      appLog
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appLog, onStateChangeForReRender]); // Initial context passed, updated via useEffect

  useEffect(() => {
    managerInstance._setAudioContext(audioContext);
  }, [audioContext, managerInstance]);

  // The hook now delegates all core logic to the managerInstance.
  // The hook's responsibility is to manage the lifecycle of the managerInstance
  // and bridge it with React's context/state if needed (though onStateChangeForReRender handles most UI updates).

  // The managedNativeNodesRef was originally a useRef in the hook.
  // The class now manages this internally. If the hook's consumers need access to this map,
  // the class should provide a getter, and the hook's interface can expose that.
  // The class has `getManagedNodesMap()`. We will not expose the RefObject directly from the hook anymore.
  // If `managedNativeNodesRef` was part of the old hook's return type, it needs to be adjusted.
  // The INativeNodeManager interface (which this hook should return) does not list managedNativeNodesRef.

  return {
    setupManagedNativeNode: managerInstance.setupManagedNativeNode.bind(managerInstance),
    updateManagedNativeNodeParams: managerInstance.updateManagedNativeNodeParams.bind(managerInstance),
    triggerNativeNodeEnvelope: managerInstance.triggerNativeNodeEnvelope.bind(managerInstance),
    triggerNativeNodeAttackHold: managerInstance.triggerNativeNodeAttackHold.bind(managerInstance),
    triggerNativeNodeRelease: managerInstance.triggerNativeNodeRelease.bind(managerInstance),
    removeManagedNativeNode: managerInstance.removeManagedNativeNode.bind(managerInstance),
    removeAllManagedNativeNodes: managerInstance.removeAllManagedNativeNodes.bind(managerInstance),
    getAnalyserNodeForInstance: managerInstance.getAnalyserNodeForInstance.bind(managerInstance),
    // managedNativeNodesRef is no longer part of the public interface as the class encapsulates it.
    // If access to the map is needed, a method like getManagedNodesMap() from the class could be exposed.
  };
};
