import { BlockInstance, Connection, BlockDefinition } from '../../types';
import { BlockStateManager } from '../../state/BlockStateManager';
import { AudioEngine } from '../../hooks/AudioEngine';
import { LogicExecutionService } from '../../services/LogicExecutionService';

export class LogicExecutionEngineManager {
  private logicExecutionService: LogicExecutionService;

  constructor(
    blockStateManager: BlockStateManager,
    getDefinitionForBlock: (instance: BlockInstance) => BlockDefinition | undefined,
    initialAudioEngine: AudioEngine | null // Can be initially null
  ) {
    // Note: LogicExecutionService constructor no longer takes appLog
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
}
