// controllers/BlockInstanceController.ts
import { BlockDefinition, BlockInstance, Connection } from '@types/types'; // Adjust path
import { BlockStateManager } from '../state/BlockStateManager'; // Adjust path
import { AudioEngineService } from '@services/AudioEngineService'; // Adjust path
import { ConnectionState } from '@services/ConnectionState'; // Adjust path
import {
    AUDIO_OUTPUT_BLOCK_DEFINITION,
    // GAIN_BLOCK_DEFINITION, // Removed from here
    LYRIA_MASTER_BLOCK_DEFINITION,
    OSCILLOSCOPE_BLOCK_DEFINITION
} from '@constants/constants'; // Adjust path
import { GAIN_BLOCK_DEFINITION } from '@services/native-blocks/GainControlNativeBlock'; // Added here

export class BlockInstanceController {
    private blockStateManager: BlockStateManager;
    private audioEngineService: AudioEngineService;
    private connectionState: ConnectionState;
    private setSelectedInstanceId: (id: string | null) => void;
    private getGlobalBpm: () => number; // To get current BPM when needed
    private getBlockInstances: () => BlockInstance[]; // To get current block instances

    constructor(
        blockStateManager: BlockStateManager,
        audioEngineService: AudioEngineService,
        connectionState: ConnectionState,
        setSelectedInstanceId: (id: string | null) => void,
        getGlobalBpm: () => number,
        getBlockInstances: () => BlockInstance[]
    ) {
        this.blockStateManager = blockStateManager;
        this.audioEngineService = audioEngineService;
        this.connectionState = connectionState;
        this.setSelectedInstanceId = setSelectedInstanceId;
        this.getGlobalBpm = getGlobalBpm;
        this.getBlockInstances = getBlockInstances;
    }

    private getDefinitionForBlock(instance: BlockInstance): BlockDefinition | undefined {
        return this.blockStateManager.getDefinitionById(instance.definitionId);
    }

    public addBlockFromDefinition = (definition: BlockDefinition, name?: string, position?: { x: number; y: number }): BlockInstance | null => {
        const newInstance = this.blockStateManager.addBlockInstance(definition, name, position);
        const globalBpm = this.getGlobalBpm();

        if (newInstance && definition.runsAtAudioRate && this.audioEngineService.audioContext && this.audioEngineService.audioContext.state === 'running') {
            if (definition.id === LYRIA_MASTER_BLOCK_DEFINITION.id) {
                const setupPromise = this.audioEngineService.lyriaServiceManager.setupLyriaServiceForInstance?.(
                    newInstance.instanceId,
                    definition,
                    (msg) => this.blockStateManager.addLogToBlockInstance(newInstance.instanceId, msg)
                ) || Promise.resolve(false);

                setupPromise.then(success => {
                    this.blockStateManager.updateBlockInstance(newInstance.instanceId, currentInst => ({
                        ...currentInst,
                        internalState: { ...currentInst.internalState, lyriaServiceReady: !!success, needsAudioNodeSetup: !success },
                        error: success ? null : "Lyria Service setup failed."
                    }));
                });
            } else if (definition.audioWorkletProcessorName && this.audioEngineService.audioWorkletManager.isAudioWorkletSystemReady) {
                const node = this.audioEngineService.addManagedAudioWorkletNode(newInstance.instanceId, { processorName: definition.audioWorkletProcessorName, nodeOptions: newInstance.parameters });
                if (node) {
                    this.blockStateManager.updateBlockInstance(newInstance.instanceId, { internalState: { ...newInstance.internalState, needsAudioNodeSetup: false } });
                } else {
                    this.blockStateManager.updateBlockInstance(newInstance.instanceId, { error: "Failed to add audio worklet node." });
                }
            } else if (!definition.audioWorkletProcessorName) { // Native node
                const node = this.audioEngineService.addNativeNode(newInstance.instanceId, definition, newInstance.parameters, globalBpm);
                if (node) {
                    this.blockStateManager.updateBlockInstance(newInstance.instanceId, { internalState: { ...newInstance.internalState, needsAudioNodeSetup: false } });
                } else {
                    this.blockStateManager.updateBlockInstance(newInstance.instanceId, { error: "Failed to add native audio node." });
                }
            }
        } else if (newInstance && definition.runsAtAudioRate) {
            // Audio system not ready, mark for setup
            this.blockStateManager.updateBlockInstance(newInstance.instanceId, {
                internalState: { ...newInstance.internalState, needsAudioNodeSetup: true, lyriaServiceReady: false }
            });
        }
        return newInstance; // Return the new instance
    };

    public updateInstance = (instanceId: string, updates: Partial<BlockInstance> | ((prev: BlockInstance) => BlockInstance)) => {
        this.blockStateManager.updateBlockInstance(instanceId, updates);
    };

    public deleteInstance = (instanceId: string, currentSelectedInstanceId: string | null) => {
        const blockInstances = this.getBlockInstances();
        const instanceToRemove = blockInstances.find(b => b.instanceId === instanceId);

        if (instanceToRemove) {
            const definition = this.getDefinitionForBlock(instanceToRemove);
            if (definition?.id === LYRIA_MASTER_BLOCK_DEFINITION.id) {
                this.audioEngineService.lyriaServiceManager.removeLyriaServiceForInstance?.(instanceId);
            } else if (definition?.audioWorkletProcessorName) {
                this.audioEngineService.removeManagedAudioWorkletNode(instanceId);
            } else if (definition?.id.startsWith('native-') || definition?.id === GAIN_BLOCK_DEFINITION.id || definition?.id === AUDIO_OUTPUT_BLOCK_DEFINITION.id || definition?.id === OSCILLOSCOPE_BLOCK_DEFINITION.id) {
                this.audioEngineService.removeNativeNode(instanceId);
            }
        }

        this.blockStateManager.deleteBlockInstance(instanceId);
        this.connectionState.updateConnections(prev => prev.filter(c => c.fromInstanceId !== instanceId && c.toInstanceId !== instanceId));

        if (currentSelectedInstanceId === instanceId) {
            this.setSelectedInstanceId(null);
        }
    };
}
