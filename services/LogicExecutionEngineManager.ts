/**
 * This service manages the lifecycle and core dependencies of the `LogicExecutionService`.
 * It acts as a higher-level controller, ensuring that the `LogicExecutionService` is always provided with the most current application state, including block instances, connections, global BPM, and the main `AudioEngine` instance.
 * A key responsibility of this manager is to start or stop the `LogicExecutionService`'s processing loop based on whether audio is globally enabled and the audio engine is available.
 * It also provides an interface to clear cached logic functions from the underlying `LogicExecutionService`, which is essential when block functionalities are updated dynamically.
 * Essentially, this manager orchestrates the operational state of the non-audio-rate logic execution within the application.
 */
import { BlockInstance, Connection, BlockDefinition } from '../types';
import { BlockStateManager } from '../state/BlockStateManager';
import { AudioEngine } from './AudioEngine'; // Corrected path to the hook's interface
import { LogicExecutionService } from '../services/LogicExecutionService'; // Corrected path

export class LogicExecutionEngineManager {
  private logicExecutionService: LogicExecutionService;

  constructor(
    blockStateManager: BlockStateManager,
    getDefinitionForBlock: (instance: BlockInstance) => BlockDefinition | undefined,
    initialAudioEngine: AudioEngine | null // Can be initially null
  ) {
    this.logicExecutionService = new LogicExecutionService(
      blockStateManager,
      getDefinitionForBlock,
      initialAudioEngine // Pass initialAudioEngine here
    );
  }

  public updateCoreDependencies(
    appBlockInstances: BlockInstance[],
    connections: Connection[],
    globalBpm: number,
    isAudioGloballyEnabled: boolean,
    audioEngine: AudioEngine | null // Can change, e.g. become available
  ): void {
    // Update dependencies for the service
    this.logicExecutionService.updateDependencies(
      appBlockInstances,
      connections,
      globalBpm,
      isAudioGloballyEnabled,
      audioEngine
    );

    // Manage processing loop based on current audio state
    // This logic is derived from the original useLogicExecutionEngine's useEffect
    if (isAudioGloballyEnabled && audioEngine) {
      this.logicExecutionService.startProcessingLoop();
    } else {
      this.logicExecutionService.stopProcessingLoop();
    }
  }

  public dispose(): void {
    this.logicExecutionService.stopProcessingLoop();
    console.log("[LogicExecutionEngineManager] Disposed and stopped processing loop.");
  }

  // Method to clear a specific block's logic function from the cache
  public clearBlockFromCache(instanceId: string): void {
    if (this.logicExecutionService) {
      this.logicExecutionService.clearBlockFromCache(instanceId);
    }
  }

  // Optional: Method to clear the entire logic function cache
  public clearAllLogicFunctionCache(): void {
    if (this.logicExecutionService) {
        this.logicExecutionService.clearLogicFunctionCache();
    }
  }
}
