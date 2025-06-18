// controllers/BlockInstanceController.ts
import * as Tone from 'tone'; // Added Tone import
import { BlockDefinition, BlockInstance } from '@interfaces/common';
import { BlockStateManager } from '@state/BlockStateManager';
import AudioEngineServiceInstance from '@services/AudioEngineService'; // Corrected import
import { ConnectionState } from '@services/ConnectionState';
import { GainControlNativeBlock } from '@services/native-blocks/GainControlNativeBlock';
import { OscilloscopeNativeBlock } from '@services/native-blocks/OscilloscopeNativeBlock';
import { AudioOutputNativeBlock } from '@services/native-blocks/AudioOutputNativeBlock'; // Added import
// import { LYRIA_MASTER_BLOCK_DEFINITION } from '@constants/lyria'; // Removed
import { LyriaMasterBlock } from '@services/lyria-blocks/LyriaMaster'; // Added


export class BlockInstanceController {
    private blockStateManager: BlockStateManager;
    private audioEngineService: typeof AudioEngineServiceInstance; // Corrected type
    private connectionState: ConnectionState;
    private setSelectedInstanceId: (id: string | null) => void;
    private getGlobalBpm: () => number; // To get current BPM when needed
    private getBlockInstances: () => BlockInstance[]; // To get current block instances

    constructor(
        blockStateManager: BlockStateManager,
        passedAudioEngineService: typeof AudioEngineServiceInstance, // Corrected param type
        connectionState: ConnectionState,
        setSelectedInstanceId: (id: string | null) => void,
        getGlobalBpm: () => number,
        getBlockInstances: () => BlockInstance[]
    ) {
        this.blockStateManager = blockStateManager;
        this.audioEngineService = passedAudioEngineService; // Use passed instance
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
        const toneContext = Tone.getContext();

        if (newInstance && definition.runsAtAudioRate && toneContext && toneContext.state === 'running') {
            if (definition.audioWorkletProcessorName && this.audioEngineService.audioWorkletManager.isAudioWorkletSystemReady) {
                // The addManagedAudioWorkletNode method is now async and returns a boolean
                const success = await this.audioEngineService.addManagedAudioWorkletNode(newInstance.instanceId, definition, newInstance.parameters);
                if (success) {
                    this.blockStateManager.updateBlockInstance(newInstance.instanceId, { internalState: { ...newInstance.internalState, needsAudioNodeSetup: false } });
                } else {
                    this.blockStateManager.updateBlockInstance(newInstance.instanceId, { error: "Failed to add audio worklet node." });
                }
            } else if (!definition.audioWorkletProcessorName) { // Native node (now Tone.js based)
                // Assuming addNativeNode returns a boolean or similar indication of success
                const success = await this.audioEngineService.addNativeNode(newInstance.instanceId, definition, newInstance.parameters, globalBpm);
                if (success) {
                    this.blockStateManager.updateBlockInstance(newInstance.instanceId, { internalState: { ...newInstance.internalState, needsAudioNodeSetup: false } });
                } else {
                    this.blockStateManager.updateBlockInstance(newInstance.instanceId, { error: "Failed to add native (Tone.js) audio node." });
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
            // Check if definition exists before accessing its properties
            if (definition) {
                if (definition.id === LyriaMasterBlock.getDefinition().id) {
                    this.audioEngineService.lyriaServiceManager?.removeLyriaServiceForInstance?.(instanceId);
                } else if (definition.audioWorkletProcessorName) {
                    this.audioEngineService.removeManagedAudioWorkletNode(instanceId);
                } else if (
                    definition.id.startsWith('tone-') || // Check for new 'tone-' prefix
                    definition.id.startsWith('native-') || // Keep old 'native-' prefix for unrefactored blocks
                    definition.id === GainControlNativeBlock.getDefinition().id || // Explicitly check old IDs if they weren't changed
                    definition.id === AudioOutputNativeBlock.getDefinition().id ||
                    definition.id === OscilloscopeNativeBlock.getDefinition().id
                    // Add other refactored block old IDs here if their definition IDs were not updated to 'tone-'
                ) {
                    this.audioEngineService.removeNativeNode(instanceId);
                }
            }
        }

        this.blockStateManager.deleteBlockInstance(instanceId);
        this.connectionState.updateConnections(prev => prev.filter(c => c.fromInstanceId !== instanceId && c.toInstanceId !== instanceId));

        if (currentSelectedInstanceId === instanceId) {
            this.setSelectedInstanceId(null);
        }
    };
}
