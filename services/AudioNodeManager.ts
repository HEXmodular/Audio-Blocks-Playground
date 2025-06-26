/**
 * This service orchestrates the lifecycle and parameterization of audio nodes within a block-based audio graph.
 * It acts as an intermediary between high-level block instance representations and the underlying `AudioEngineService`, translating block configurations into concrete audio node setups and updates.
 * Key responsibilities include processing the setup and teardown of various audio nodes (AudioWorklets, native Web Audio nodes, and Lyria services) based on global audio state and block definitions.
 * The manager also handles real-time updates to audio node parameters, manages specialized updates for Lyria services (like auto-play and state synchronization), and triggers updates to the overall audio graph connections.
 * It utilizes a `BlockStateManager` for logging and persisting state changes to block instances, ensuring the application's view of the audio graph remains consistent with the audio engine's state.
 */
// services/AudioNodeManager.ts
import * as Tone from 'tone'; // Added Tone import
import AudioEngineService from './AudioEngineService'; // Corrected import
import { BlockInstance, NativeBlock } from '@interfaces/block';

import BlockStateManager from '@state/BlockStateManager';

// Imports from NativeNodeManager
// import {

//     ManagedNativeNodeInfo,
// } from '@interfaces/common';
// import { CreatableNode } from '@services/native-blocks/CreatableNode';
import { AudioOutputBlock } from '@blocks/native-blocks/AudioOutputBlock';
// import { GainControlNativeBlock } from '@services/native-blocks/GainControlNativeBlock';
// import { OscillatorNativeBlock } from '@services/native-blocks/OscillatorNativeBlock';
// import { BiquadFilterNativeBlock } from '@services/native-blocks/BiquadFilterNativeBlock';
// import { DelayNativeBlock } from '@services/native-blocks/DelayNativeBlock';
// import { OscilloscopeNativeBlock } from '@services/native-blocks/OscilloscopeNativeBlock';
// import { EnvelopeNativeBlock } from '@services/native-blocks/EnvelopeNativeBlock';
// import { StepSequencerNativeBlock } from './native-blocks/sequencers/StepSequencerNativeBlock';
// import { ManualGateNativeBlock } from './native-blocks/ManualGateNativeBlock';
import { ByteBeatPlayer } from '@blocks/8bit/ByteBeatPlayer';


class AudioNodeManager {
    private static instance: AudioNodeManager;

    // Properties from NativeNodeManager
    private managedNativeNodesRef: Map<string, ManagedNativeNodeInfo>;
    private blockHandlers: Map<string, typeof Tone.ToneAudioNode & NativeBlock>; // Map of block handlers keyed by definition ID
    private readonly onStateChangeForReRender: () => void; // Will be a no-op or tied to BlockStateManager if necessary

    private constructor() {
        // Private constructor to prevent direct instantiation
        BlockStateManager.init(
            () => { }, // For onDefinitionsChange, do nothing for now
            (instances) => { // For onInstancesChange
                // console.log('[AudioNodeManager] Received instance updates from BlockStateManager.');
                this.updateAudioNodeParameters(instances);
            }
        );

        // Initialization from NativeNodeManager's constructor
        this.onStateChangeForReRender = () => {
            // This was used in NativeNodeManager to trigger re-renders.
            // BlockStateManager.getInstances() might trigger updates through its own mechanism if instance states are changed here.
            // For now, keeping it simple. If UI updates are missing, this is a place to investigate.
        };
        this.managedNativeNodesRef = new Map();
        this.blockHandlers = new Map();
        this.initializeBlockHandlers(); // Call initialization for native block handlers
    }

    // Static method to get the singleton instance
    public static getInstance(): AudioNodeManager {
        if (!AudioNodeManager.instance) {
            AudioNodeManager.instance = new AudioNodeManager();
        }
        return AudioNodeManager.instance;
    }

    // Methods from NativeNodeManager (to be integrated below)

    private initializeBlockHandlers(): void {
        // this.blockHandlers.set(GainControlNativeBlock.getDefinition().id, new GainControlNativeBlock());
        // this.blockHandlers.set(OscillatorNativeBlock.getOscillatorDefinition().id, new OscillatorNativeBlock());
        // this.blockHandlers.set(OscillatorNativeBlock.getLfoDefinition().id, new OscillatorNativeBlock());
        // this.blockHandlers.set(OscillatorNativeBlock.getLfoBpmSyncDefinition().id, new OscillatorNativeBlock());
        // this.blockHandlers.set(BiquadFilterNativeBlock.getDefinition().id, new BiquadFilterNativeBlock());
        // this.blockHandlers.set(DelayNativeBlock.getDefinition().id, new DelayNativeBlock());
        // this.blockHandlers.set(EnvelopeNativeBlock.getDefinition().id, new EnvelopeNativeBlock());
        this.blockHandlers.set(AudioOutputBlock.getDefinition().id, AudioOutputBlock);
        // this.blockHandlers.set(StepSequencerNativeBlock.getDefinition().id, new StepSequencerNativeBlock());
        // this.blockHandlers.set(ManualGateNativeBlock.getDefinition().id, new ManualGateNativeBlock());
        // this.blockHandlers.set(LyriaMasterBlock.getDefinition().id, new LyriaMasterBlock());
        this.blockHandlers.set(ByteBeatPlayer.getDefinition().id, ByteBeatPlayer);


    }

    public setupManagedNativeNode(
        // instanceId: string,
        // definition: BlockDefinition,
        // initialParams: BlockParameter[],
        // blockHandler: [string, any]
        instance: BlockInstance, // Use BlockInstance directly
    ): boolean {
        // console.log(`[AudioNodeManager/Native Setup] Setting up Tone.js based node for '${definition.name}' (ID: ${instanceId})`);
        try {
            const classRef = this.blockHandlers.get(instance.definition.id)  as any //as ({constructor: new (params: BlockParameter[]) => Tone.ToneAudioNode});
            // initialParams
            const instanceRef = new classRef() as Tone.ToneAudioNode & NativeBlock; // Create an instance of the Tone.js based node class

            // все данные по ноде есть тут
            const nodeInfo: ManagedNativeNodeInfo = {
                definition: instance.definition, // Use the BlockInstance's definition directly
                instanceId: instance.instanceId, // Use the BlockInstance's instanceId directly
                nodeForInputConnections: instanceRef.input,
                nodeForOutputConnections: instanceRef.output,
                instance: instanceRef,
                // internalState: {},
            };

            this.managedNativeNodesRef.set(instance.instanceId, nodeInfo);
            this.onStateChangeForReRender();
            return true;
        } catch (e) {
            console.error(`Failed to construct Tone.js based node: ${(e as Error).message}`);
            debugger
            return false;
        }
    }

    public removeManagedNativeNode(instanceId: string): void {
        const nodeInfo = this.managedNativeNodesRef.get(instanceId);
        if (nodeInfo) {
            const handler = nodeInfo.instance;
            handler?.dispose();
            this.managedNativeNodesRef.delete(instanceId);
            this.onStateChangeForReRender();
        }
    }

    public getManagedNodesMap(): Map<string, ManagedNativeNodeInfo> {
        return this.managedNativeNodesRef;
    }

    // removeNode is an alias used by AudioEngineService, maps to removeManagedNativeNode
    public removeNode(nodeId: string): void {
        this.removeManagedNativeNode(nodeId);
    }

    public getNodeInfo(nodeId: string): ManagedNativeNodeInfo | undefined {
        return this.managedNativeNodesRef.get(nodeId);
    }

    public getAllNodeInfo(): ManagedNativeNodeInfo[] {
        return Array.from(this.managedNativeNodesRef.values());
    }

    // Original AudioNodeManager methods start here
    public updateInstance(instanceId: string, updates: Partial<BlockInstance> | ((prev: BlockInstance) => BlockInstance)) {
        BlockStateManager.updateBlockInstance(instanceId, updates);
    }

    // генерирует тонну говна
    private addLog(instanceId: string, message: string, _type: 'info' | 'warn' | 'error' = 'info') {
        BlockStateManager.addLogToBlockInstance(instanceId, message);
    }

    public async processAudioNodeSetupAndTeardown(
    ) {
        // const blockInstances = Array.from(this.blockHandlers.values()) //BlockStateManager.getBlockInstances();
        // console.log('[AudioNodeManager processAudioNodeSetupAndTeardown] Entry. GlobalAudioEnabled:', isAudioGloballyEnabled, 'WorkletSystemReady:', isWorkletSystemReady, 'AudioContext State:', audioContextCurrent?.state);
        // console.log('[AudioNodeManager processAudioNodeSetupAndTeardown] Number of blockInstances received:', blockInstances.length);

        const blockInstances = BlockStateManager.getBlockInstances() // получение сохраненных блоков с их уникальным идентификатором instanceId

        if (blockInstances.length > 0) {
            console.log('[AudioNodeManager processAudioNodeSetupAndTeardown] Instance IDs:', blockInstances.map(inst => inst.instanceId));
        }

        for (const instance of blockInstances) {
            if (!instance.instance) {
                // Node needs setup.
                let setupSuccess = false; // Initialize setupSuccess for this scope

                // Directly call the merged method. AudioEngineService.addNativeNode was a wrapper around NativeNodeManager.setupManagedNativeNode.
                // We need to ensure the parameters match. setupManagedNativeNode expects:
                // instanceId: string, definition: BlockDefinition, initialParams: BlockParameter[], currentBpm?: number
                // AudioEngineService.addNativeNode was called with: instanceId, definition, instance.parameters
                // So, this should be a direct replacement. The globalBpm is optional and defaults to 120.
                setupSuccess = this.setupManagedNativeNode(instance);
                if (setupSuccess) {
                    this.updateInstance(instance.instanceId, currentInst => ({
                        ...currentInst,
                        // internalState: { ...currentInst.internalState, needsAudioNodeSetup: false, loggedAudioSystemNotActive: false }
                    }));
                    this.addLog(instance.instanceId, "Native node setup successful.");
                    console.log(instance.instanceId, "Native node setup successful.");
                } else {
                    debugger
                    this.addLog(instance.instanceId, "Native node setup failed.", "error");
                    console.error(instance.instanceId, "Native node setup failed.", "error");
                    // this.updateInstance(instance.instanceId, { error: "Native node setup failed." });
                }

            }

        }
    }

    public updateAudioNodeParameters(blockInstances: BlockInstance[]) {
        if (!Tone.getContext() || Tone.getContext().state !== 'running') return;

        blockInstances.forEach(instance => {
            const definition = instance.definition; 
            if (!definition || !instance.instance) {
                console.warn(`[AudioNodeManager/Native Update] No handler found for definition ID '${definition?.id}'.`);
                return;
            }

            // const info = this.managedNativeNodesRef.get(instance.instanceId);
            // // console.log(`[↔ AudioNodeManager/Native Update] Updating node params for '${info?.definition.name}' (ID: ${instanceId}) with parameters:`, parameters);
            // if (!info) return;

            // const handler = this.managedNativeNodesRef.get(info.instanceId)
            // if (handler?.instance) {
                instance.instance.updateFromBlockInstance(instance);
            // } else {
            // }

        });
    }

    public updateAudioGraphConnections(
    ) {
        // Check Tone.js context state for updating graph connections
        if (!Tone.getContext()) return;
        AudioEngineService.updateAudioGraphConnections();

    }
}

export default AudioNodeManager.getInstance();
