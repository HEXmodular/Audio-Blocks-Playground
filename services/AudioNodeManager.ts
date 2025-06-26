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
import { BlockInstance, BlockDefinition, BlockParameter } from '@interfaces/block';

import BlockStateManager from '@state/BlockStateManager';
import { LyriaMasterBlock } from './lyria-blocks/LyriaMaster'; // Added

// Imports from NativeNodeManager
// import {

//     ManagedNativeNodeInfo,
// } from '@interfaces/common';
// import { CreatableNode } from '@services/native-blocks/CreatableNode';
import { AudioOutputNativeBlock } from '@blocks/native-blocks/AudioOutputNativeBlock';
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
    private blockHandlers: Map<string, CreatableNode>;
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
            // console.log('[AudioNodeManager internal] onStateChangeForReRender called. Currently a no-op after merge.');
            // This was used in NativeNodeManager to trigger re-renders.
            // BlockStateManager.getInstances() might trigger updates through its own mechanism if instance states are changed here.
            // For now, keeping it simple. If UI updates are missing, this is a place to investigate.
        };
        this.managedNativeNodesRef = new Map<string, ManagedNativeNodeInfo>();
        this.blockHandlers = new Map<string, CreatableNode>();
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
        this.blockHandlers.set(AudioOutputNativeBlock.getDefinition().id, AudioOutputNativeBlock);
        // this.blockHandlers.set(StepSequencerNativeBlock.getDefinition().id, new StepSequencerNativeBlock());
        // this.blockHandlers.set(ManualGateNativeBlock.getDefinition().id, new ManualGateNativeBlock());
        // this.blockHandlers.set(LyriaMasterBlock.getDefinition().id, new LyriaMasterBlock());
        this.blockHandlers.set(ByteBeatPlayer.getDefinition().id, ByteBeatPlayer);


    }

    public async setupManagedNativeNode(
        instanceId: string,
        definition: BlockDefinition,
        initialParams: BlockParameter[],
    ): Promise<boolean> {
        console.log(`[AudioNodeManager/Native Setup] Setting up Tone.js based node for '${definition.name}' (ID: ${instanceId})`);

        const handler = this.blockHandlers.get(definition.id);
        if (!handler) {
            console.warn(`[AudioNodeManager/Native Setup] No handler for definition ID '${definition.id}'.`);
            debugger
            return false;
        }

        try {
            const classRef = handler
            const instance = new classRef(initialParams);

            // все данные по ноде есть тут
            const nodeInfo: ManagedAudioOutputNodeInfo = {
                definition: classRef.getDefinition(),
                instanceId,
                // toneGain,
                node: instance.input,
                nodeForInputConnections: instance.input,
                nodeForOutputConnections: instance.output,
                mainProcessingNode: instance.input,
                // paramTargetsForCv: specificParamTargetsForCv,
                // internalGainNode: toneGain as unknown as Tone.Gain,
                instance,

                internalState: {},
            };


            this.managedNativeNodesRef.set(instanceId, nodeInfo);
            this.onStateChangeForReRender();
            return true;
        } catch (e) {
            console.error(`Failed to construct Tone.js based node for '${definition.name}' (ID: ${instanceId}): ${(e as Error).message}`);
            debugger
            return false;
        }
    }

    public removeManagedNativeNode(instanceId: string): void {
        const nodeInfo = this.managedNativeNodesRef.get(instanceId);
        if (nodeInfo) {
            const handler = this.blockHandlers.get(nodeInfo.definition.id);
            handler?.dispose(nodeInfo);
            this.managedNativeNodesRef.delete(instanceId);
            this.onStateChangeForReRender();
        }
    }


    public getAnalyserNodeForInstance(instanceId: string): AnalyserNode | null {
        const nodeInfo = this.managedNativeNodesRef.get(instanceId);
        if (nodeInfo?.definition.id === OscilloscopeNativeBlock.getDefinition().id) {
            return nodeInfo.mainProcessingNode as AnalyserNode;
        }
        return null;
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
        const blockInstances = BlockStateManager.getBlockInstances();
        // console.log('[AudioNodeManager processAudioNodeSetupAndTeardown] Entry. GlobalAudioEnabled:', isAudioGloballyEnabled, 'WorkletSystemReady:', isWorkletSystemReady, 'AudioContext State:', audioContextCurrent?.state);
        console.log('[AudioNodeManager processAudioNodeSetupAndTeardown] Number of blockInstances received:', blockInstances.length);
        if (blockInstances.length > 0) {
            console.log('[AudioNodeManager processAudioNodeSetupAndTeardown] Instance IDs:', blockInstances.map(inst => inst.instanceId));
        }

        for (const instance of blockInstances) {
            const definition = BlockStateManager.getDefinitionForBlock(instance);
            console.log('[AudioNodeManager processAudioNodeSetupAndTeardown] Processing instance:', { instanceId: instance.instanceId, name: instance.name, needsAudioNodeSetup: instance.internalState.needsAudioNodeSetup, definitionId: instance.definitionId, runsAtAudioRate: definition?.runsAtAudioRate });
            // console.log(`[AudioNodeManager DEBUG] Processing instance: ${instance.instanceId}, Def ID: ${instance.definitionId}`);
            if (!definition) {
                // console.log(`[AudioNodeManager DEBUG]   No definition found for ${instance.instanceId}. Skipping.`);
                continue;
            }

            // Pre-condition: usableContext.state is 'running'
            const isAudioGloballyEnabled = true; // Assume this is set globally or passed in
            if (isAudioGloballyEnabled) {
                // Context is RUNNING (guaranteed by outer guard) and Global Audio is ON.
                if (instance.internalState.needsAudioNodeSetup) {
                    // Node needs setup.
                    let setupSuccess = false; // Initialize setupSuccess for this scope
                    if (!definition.audioWorkletProcessorName) { // Native Node
                        this.addLog(instance.instanceId, "Native node setup initiated (audio on).");
                        console.log(instance.instanceId, "Native node setup initiated (audio on).");
                        console.log('[AudioNodeManager] Attempting to call this.setupManagedNativeNode for instance:', { instanceId: instance.instanceId, definitionId: definition.id, needsAudioNodeSetup: instance.internalState.needsAudioNodeSetup, contextState: Tone.getContext()?.state, isAudioGloballyEnabled });
                        // Directly call the merged method. AudioEngineService.addNativeNode was a wrapper around NativeNodeManager.setupManagedNativeNode.
                        // We need to ensure the parameters match. setupManagedNativeNode expects:
                        // instanceId: string, definition: BlockDefinition, initialParams: BlockParameter[], currentBpm?: number
                        // AudioEngineService.addNativeNode was called with: instanceId, definition, instance.parameters
                        // So, this should be a direct replacement. The globalBpm is optional and defaults to 120.
                        setupSuccess = await this.setupManagedNativeNode(instance.instanceId, definition, instance.parameters);
                        if (setupSuccess) {
                            this.updateInstance(instance.instanceId, currentInst => ({
                                ...currentInst,
                                internalState: { ...currentInst.internalState, needsAudioNodeSetup: false, loggedAudioSystemNotActive: false }
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
            } else {
                // Context is RUNNING (guaranteed by outer guard) BUT Global Audio is OFF.
                if (!instance.internalState.needsAudioNodeSetup) { // Check definition.runsAtAudioRate here
                    // if (definition.runsAtAudioRate && !instance.internalState.needsAudioNodeSetup) { // Check definition.runsAtAudioRate here
                    // Node was previously set up, but global audio is now off. Mark it for re-setup.
                    const needsToLog = !instance.internalState.loggedAudioSystemNotActive;
                    this.updateInstance(instance.instanceId, currentInst => ({
                        ...currentInst,
                        internalState: {
                            ...currentInst.internalState,
                            needsAudioNodeSetup: true,
                            lyriaServiceReady: false,
                            autoPlayInitiated: false,
                            loggedAudioSystemNotActive: true
                        }
                    }));
                    if (needsToLog) {
                        this.addLog(instance.instanceId, "Audio globally disabled, context is running. Node marked for re-setup.", "warn");
                        console.warn(instance.instanceId, "Audio globally disabled, context is running. Node marked for re-setup.", "warn");
                    }
                } else {
                    // Node already needs setup (needsAudioNodeSetup is true), or doesn't run at audio rate. And global audio is off. DO NOTHING.
                }
            }
        }
    }

    public updateAudioNodeParameters(blockInstances: BlockInstance[]) {
        if (!Tone.getContext() || Tone.getContext().state !== 'running') return;

        blockInstances.forEach(instance => {
            const definition = BlockStateManager.getDefinitionForBlock(instance);
            if (!definition || instance.internalState.needsAudioNodeSetup) {
                return;
            }

            if (definition.audioWorkletProcessorName) {
                // AudioWorkletManager.updateManagedAudioWorkletNodeParams(instance.instanceId, instance.parameters);
            } else {

                const info = this.managedNativeNodesRef.get(instance.instanceId);
                // console.log(`[↔ AudioNodeManager/Native Update] Updating node params for '${info?.definition.name}' (ID: ${instanceId}) with parameters:`, parameters);
                if (!info) return;

                const handler = this.managedNativeNodesRef.get(info.instanceId)
                if (handler?.instance) {
                    handler.instance.updateFromBlockInstance(instance);
                } else {
                    console.warn(`[AudioNodeManager/Native Update] No handler found for definition ID '${info.definition?.id}'.`);
                }
            }
        });
    }

    public updateAudioGraphConnections(
        isAudioGloballyEnabled: boolean
    ) {
        // Check Tone.js context state for updating graph connections
        if (!Tone.getContext()) return;
        if (isAudioGloballyEnabled) {
            AudioEngineService.updateAudioGraphConnections();
        } else {
            // Clear connections if audio is disabled
            AudioEngineService.updateAudioGraphConnections();
        }
    }
}

export default AudioNodeManager.getInstance();
