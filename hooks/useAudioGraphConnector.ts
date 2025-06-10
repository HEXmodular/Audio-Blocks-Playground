import { useCallback, useRef, useEffect } from 'react'; // Added useEffect
import { Connection, BlockInstance, BlockDefinition } from '../types';
import { AudioGraphConnectorService } from '../services/AudioGraphConnectorService'; // Import the service
import { ManagedWorkletNodeInfo } from './useAudioWorkletManager';
import { ManagedNativeNodeInfo } from './useNativeNodeManager';
import { ManagedLyriaServiceInfo } from './useLyriaServiceManager';
// ActiveWebAudioConnection is now defined within AudioGraphConnectorService, so not needed here.

// Interface for the hook's return type remains the same externally
export interface AudioGraphConnector {
  updateAudioGraphConnections: (
    connections: Connection[],
    blockInstances: BlockInstance[],
    getDefinitionForBlock: (instance: BlockInstance) => BlockDefinition | undefined,
    managedWorkletNodes: Map<string, ManagedWorkletNodeInfo>,
    managedNativeNodes: Map<string, ManagedNativeNodeInfo>,
    managedLyriaServices: Map<string, ManagedLyriaServiceInfo>
  ) => void;
}

interface UseAudioGraphConnectorProps {
  appLog: (message: string, isSystem?: boolean) => void;
  audioContext: AudioContext | null;
  isAudioGloballyEnabled: boolean;
}

export const useAudioGraphConnector = ({
  appLog,
  audioContext,
  isAudioGloballyEnabled,
}: UseAudioGraphConnectorProps): AudioGraphConnector => {
  // Instantiate the service, ensuring it's created only once
  const serviceRef = useRef<AudioGraphConnectorService | null>(null);
  if (serviceRef.current === null) {
    serviceRef.current = new AudioGraphConnectorService(appLog);
  }
  const service = serviceRef.current;

  // The core logic is now delegated to the service
  const updateAudioGraphConnections = useCallback((
    connections: Connection[],
    blockInstances: BlockInstance[],
    getDefinitionForBlock: (instance: BlockInstance) => BlockDefinition | undefined,
    managedWorkletNodes: Map<string, ManagedWorkletNodeInfo>,
    managedNativeNodes: Map<string, ManagedNativeNodeInfo>,
    managedLyriaServices: Map<string, ManagedLyriaServiceInfo>
  ) => {
    // Pass all necessary current state and dependencies to the service method
    service.updateConnections(
      audioContext,
      isAudioGloballyEnabled,
      connections,
      blockInstances,
      getDefinitionForBlock,
      managedWorkletNodes,
      managedNativeNodes,
      managedLyriaServices
    );
  }, [service, audioContext, isAudioGloballyEnabled]); // Dependencies: service instance and props that service method depends on

  // Effect to disconnect all connections when the hook unmounts or when audio becomes disabled
  useEffect(() => {
    // If audio is not globally enabled, or context is not running, ensure all connections are cleared.
    // The service's updateConnections method already handles this if called,
    // but this effect ensures cleanup if isAudioGloballyEnabled changes to false or audioContext becomes invalid.
    if (!isAudioGloballyEnabled || !audioContext || audioContext.state !== 'running') {
      service.disconnectAll();
    }

    return () => {
      // Cleanup on unmount: disconnect all active connections
      // This is important if the component using this hook unmounts,
      // for example, if the entire audio processing part of the app is removed from the UI.
      service.disconnectAll();
    };
  }, [service, audioContext, isAudioGloballyEnabled]); // Rerun if these change

  return {
    updateAudioGraphConnections,
  };
};
