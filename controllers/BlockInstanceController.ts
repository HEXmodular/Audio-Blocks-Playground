// controllers/BlockInstanceController.ts
import { BlockDefinition, BlockInstance } from '@interfaces/common';
import { BlockStateManager } from '@state/BlockStateManager';
import { AudioEngineService } from '@services/AudioEngineService';
import { ConnectionState } from '@services/ConnectionState';
import { GainControlNativeBlock } from '@services/native-blocks/GainControlNativeBlock';
import { OscilloscopeNativeBlock } from '@services/native-blocks/OscilloscopeNativeBlock';
import { AudioOutputNativeBlock } from '@services/native-blocks/AudioOutputNativeBlock'; // Added import
import { LYRIA_MASTER_BLOCK_DEFINITION } from '@constants/lyria';


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
        return this.blockStateManager.getDefinitionForBlock(instance.definitionId);
    }

    public addBlockFromDefinition = async (definition: BlockDefinition, name?: string, position?: { x: number; y: number }): Promise<BlockInstance | null> => {
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
                // The addManagedAudioWorkletNode method is now async and returns a boolean
                const success = await this.audioEngineService.addManagedAudioWorkletNode(newInstance.instanceId, definition, newInstance.parameters);
                if (success) {
                    this.blockStateManager.updateBlockInstance(newInstance.instanceId, { internalState: { ...newInstance.internalState, needsAudioNodeSetup: false } });
                } else {
                    this.blockStateManager.updateBlockInstance(newInstance.instanceId, { error: "Failed to add audio worklet node." });
                }
            } else if (!definition.audioWorkletProcessorName) { // Native node
                // Assuming addNativeNode returns a boolean or similar indication of success
                const success = await this.audioEngineService.addNativeNode(newInstance.instanceId, definition, newInstance.parameters, globalBpm);
                if (success) {
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
            } else if (
                definition?.id.startsWith('native-') ||
                definition?.id === GainControlNativeBlock.getDefinition().id ||
                definition?.id === AudioOutputNativeBlock.getDefinition().id || // Changed to AudioOutputNativeBlock
                definition?.id === OscilloscopeNativeBlock.getDefinition().id
            ) {
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
