import { useEffect, useRef } from 'react';
import { BlockInstance, Connection, BlockDefinition } from '../types';
import { BlockStateManager } from '../state/BlockStateManager';
import { AudioEngine } from './useAudioEngine';
import { LogicExecutionService } from '../services/LogicExecutionService'; // Import the service

export function useLogicExecutionEngine(
  appBlockInstances: BlockInstance[],
  connections: Connection[],
  getDefinitionForBlock: (instance: BlockInstance) => BlockDefinition | undefined,
  blockStateManager: BlockStateManager,
  audioEngine: AudioEngine | null,
  globalBpm: number,
  isAudioGloballyEnabled: boolean
) {
  const serviceRef = useRef<LogicExecutionService | null>(null);

  // Initialize the service once
  if (serviceRef.current === null) {
    serviceRef.current = new LogicExecutionService(
      blockStateManager,
      getDefinitionForBlock,
      appLog, // Pass appLog to the service constructor
      audioEngine
    );
  }
  const service = serviceRef.current;

  // Effect to update service dependencies when they change
  useEffect(() => {
    service.updateDependencies(
      appBlockInstances,
      connections,
      globalBpm,
      isAudioGloballyEnabled,
      audioEngine
    );
  }, [
    service,
    appBlockInstances,
    connections,
    globalBpm,
    isAudioGloballyEnabled,
    audioEngine
  ]);

  // Effect to manage the processing loop (start/stop)
  useEffect(() => {
    // The updateDependencies method now handles the logic for starting/stopping the loop
    // based on isAudioGloballyEnabled.
    // This effect ensures that when isAudioGloballyEnabled changes, updateDependencies is called.
    // If isAudioGloballyEnabled is true on mount (and after service initialization),
    // the loop will be started by updateDependencies.

    // Explicitly call startProcessingLoop if conditions are met and it wasn't started by updateDependencies
    // This can happen if isAudioGloballyEnabled was already true when the component mounted.
    if (isAudioGloballyEnabled && audioEngine) {
        service.startProcessingLoop();
    } else {
        service.stopProcessingLoop();
    }

    // Cleanup function to stop the processing loop when the hook unmounts
    return () => {
      service.stopProcessingLoop();
    };
  }, [service, isAudioGloballyEnabled, audioEngine]); // audioEngine is a dependency for starting

  // The hook itself doesn't need to return anything if its purpose is only to run the engine.
  // If other parts of the app needed to interact directly with the engine (e.g. force a single run),
  // then methods could be exposed from the service via the hook. For now, it's self-contained.
}
