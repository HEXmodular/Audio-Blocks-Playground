// Force recompile to address potential caching issue with async keyword detection
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
import { BlockInstance, BlockDefinition, Connection, PlaybackState } from '@interfaces/common';
import { getDefaultOutputValue } from '@state/BlockStateManager';

import BlockStateManager from '@state/BlockStateManager';
import { NUMBER_TO_CONSTANT_AUDIO_BLOCK_DEFINITION } from '@constants/constants'; 
import { LyriaMasterBlock } from './lyria-blocks/LyriaMaster'; // Added
import LyriaServiceManager from './LyriaServiceManager';
import AudioWorkletManager from './AudioWorkletManager';
import NativeNodeManager from './NativeNodeManager';
import ConnectionState from './ConnectionState'; // Added import

class AudioNodeManager {
    private static instance: AudioNodeManager;

    private constructor() {
        // Private constructor to prevent direct instantiation
        BlockStateManager.init(
            () => {}, // For onDefinitionsChange, do nothing for now
            (instances) => { // For onInstancesChange
                // console.log('[AudioNodeManager] Received instance updates from BlockStateManager.');
                const connections = ConnectionState.getConnections();
                const globalBpm = Tone.getTransport().bpm.value;
                this.updateAudioNodeParameters(instances, connections, globalBpm);
            }
        );
    }

    // Static method to get the singleton instance
    public static getInstance(): AudioNodeManager {
        if (!AudioNodeManager.instance) {
            AudioNodeManager.instance = new AudioNodeManager();
        }
        return AudioNodeManager.instance;
    }

    private updateInstance(instanceId: string, updates: Partial<BlockInstance> | ((prev: BlockInstance) => BlockInstance)) {
        BlockStateManager.updateBlockInstance(instanceId, updates);
    }

    private addLog(instanceId: string, message: string, _type: 'info' | 'warn' | 'error' = 'info') {
        BlockStateManager.addLogToBlockInstance(instanceId, message);
    }

    public async processAudioNodeSetupAndTeardown(
    ) {
        const blockInstances= BlockStateManager.getBlockInstances();
        // console.log('[AudioNodeManager processAudioNodeSetupAndTeardown] Entry. GlobalAudioEnabled:', isAudioGloballyEnabled, 'WorkletSystemReady:', isWorkletSystemReady, 'AudioContext State:', audioContextCurrent?.state);
        console.log('[AudioNodeManager processAudioNodeSetupAndTeardown] Number of blockInstances received:', blockInstances.length);
        if (blockInstances.length > 0) {
          console.log('[AudioNodeManager processAudioNodeSetupAndTeardown] Instance IDs:', blockInstances.map(inst => inst.instanceId));
        }
        // console.log(`[AudioNodeManager DEBUG] Entered processAudioNodeSetupAndTeardown. GlobalAudioEnabled: ${isAudioGloballyEnabled}, WorkletSystemReady: ${isWorkletSystemReady}, AudioContext State: ${audioContextCurrent?.state}`);
        // The erroneous if (audioContextCurrent?.rawContext) block is removed by not including it here.

        // Determine the actual usable AudioContext (native) or null
        // const usableContext = audioContextCurrent?.rawContext as AudioContext | null; // Corrected type cast

        // if (!usableContext || usableContext.state !== 'running') {
        //     blockInstances.forEach(instance => {
        //         // console.log(`[AudioNodeManager DEBUG] Processing instance (no audio context): ${instance.instanceId}, Def ID: ${instance.definitionId}`);
        //         const definition = this.getDefinition(instance);
        //         if (definition && definition.runsAtAudioRate && !instance.internalState.needsAudioNodeSetup) {
        //             // Node was set up, but audio context is now gone. Mark for setup and log if not already.
        //             const needsToLog = !instance.internalState.loggedAudioSystemNotActive;
        //             this.updateInstance(instance.instanceId, currentInst => ({
        //                 ...currentInst,
        //                 internalState: {
        //                     ...currentInst.internalState,
        //                     needsAudioNodeSetup: true,
        //                     lyriaServiceReady: false, // Reset related flags
        //                     autoPlayInitiated: false,
        //                     loggedAudioSystemNotActive: true // Set the flag
        //                 }
        //             }));
        //             if (needsToLog) {
        //                 // Use a more accurate log message here
        //                 this.addLog(instance.instanceId, "Context not running. Node marked for setup.", "warn");
        //                 console.warn(instance.instanceId, "Context not running. Node marked for setup.", "warn");
        //             }
        //         }
        //     });
        //     return; // Exit if context is not ready
        // }

        for (const instance of blockInstances) {
            const definition = BlockStateManager.getDefinitionForBlock(instance);
            console.log('[AudioNodeManager processAudioNodeSetupAndTeardown] Processing instance:', { instanceId: instance.instanceId, name: instance.name, needsAudioNodeSetup: instance.internalState.needsAudioNodeSetup, definitionId: instance.definitionId, runsAtAudioRate: definition?.runsAtAudioRate });
            // console.log(`[AudioNodeManager DEBUG] Processing instance: ${instance.instanceId}, Def ID: ${instance.definitionId}`);
            if (!definition) {
                // console.log(`[AudioNodeManager DEBUG]   No definition found for ${instance.instanceId}. Skipping.`);
                continue;
            }
            // console.log(`[AudioNodeManager DEBUG]   Instance: ${instance.name} (ID: ${instance.instanceId}), Definition: ${definition.name} (ID: ${definition.id})`);
            // console.log(`[AudioNodeManager DEBUG]   Definition details: runsAtAudioRate: ${!!definition.runsAtAudioRate}, audioWorkletProcessorName: '${definition.audioWorkletProcessorName || 'none'}'`);

            if (!definition.runsAtAudioRate) {
                // console.log(`[AudioNodeManager DEBUG]   Decision: Does not run at audio rate. SKIPPING audio node setup for ${instance.instanceId}.`);
                continue;
            }

            // Pre-condition: usableContext.state is 'running'
            const isAudioGloballyEnabled = true; // Assume this is set globally or passed in
            if (isAudioGloballyEnabled) {
                // Context is RUNNING (guaranteed by outer guard) and Global Audio is ON.
                if (instance.internalState.needsAudioNodeSetup) {
                    // Node needs setup.
                    let setupSuccess = false; // Initialize setupSuccess for this scope
                    if (definition.audioWorkletProcessorName && definition.audioWorkletCode) { // Worklet Node
                        if (AudioWorkletManager.isAudioWorkletSystemReady) {
                            if (instance.internalState.loggedWorkletSystemNotReady) {
                                this.updateInstance(instance.instanceId, currentInst => ({
                                    ...currentInst,
                                    internalState: { ...currentInst.internalState, loggedWorkletSystemNotReady: false }
                                }));
                            }
                            this.addLog(instance.instanceId, "Worklet node setup initiated (audio on).");
                            console.log(instance.instanceId, "Worklet node setup initiated (audio on).");
                            setupSuccess = await AudioWorkletManager.setupManagedAudioWorkletNode(instance.instanceId, definition, instance.parameters);
                            if (setupSuccess) {
                                this.updateInstance(instance.instanceId, currentInst => ({
                                    ...currentInst,
                                    internalState: { ...currentInst.internalState, needsAudioNodeSetup: false, loggedAudioSystemNotActive: false }
                                }));
                                this.addLog(instance.instanceId, "Worklet node setup successful.");
                                console.log(instance.instanceId, "Worklet node setup successful.");
                            } else {
                                this.addLog(instance.instanceId, "Worklet node setup failed.", "error");
                                console.error(instance.instanceId, "Worklet node setup failed.", "error");
                                this.updateInstance(instance.instanceId, { error: "Worklet node setup failed." });
                            }
                        } else { // Worklet system not ready
                            if (!instance.internalState.loggedWorkletSystemNotReady) {
                                this.addLog(instance.instanceId, "Worklet system not ready, deferring setup (audio on).", "warn");
                                console.warn(instance.instanceId, "Worklet system not ready, deferring setup (audio on).", "warn");
                                this.updateInstance(instance.instanceId, currentInst => ({
                                    ...currentInst,
                                    internalState: { ...currentInst.internalState, loggedWorkletSystemNotReady: true }
                                }));
                            }
                        }
                    }
                    else if (!definition.audioWorkletProcessorName) { // Native Node
                        this.addLog(instance.instanceId, "Native node setup initiated (audio on).");
                        console.log(instance.instanceId, "Native node setup initiated (audio on).");
                        console.log('[AudioNodeManager] Attempting to call audioEngineService.addNativeNode for instance:', { instanceId: instance.instanceId, definitionId: definition.id, needsAudioNodeSetup: instance.internalState.needsAudioNodeSetup, contextState: Tone.getContext()?.state, isAudioGloballyEnabled });
                        setupSuccess = await AudioEngineService.addNativeNode(instance.instanceId, definition, instance.parameters);
                        if (setupSuccess) {
                            this.updateInstance(instance.instanceId, currentInst => ({
                                ...currentInst,
                                internalState: { ...currentInst.internalState, needsAudioNodeSetup: false, loggedAudioSystemNotActive: false }
                            }));
                            this.addLog(instance.instanceId, "Native node setup successful.");
                            console.log(instance.instanceId, "Native node setup successful.");
                        } else {
                            this.addLog(instance.instanceId, "Native node setup failed.", "error");
                            console.error(instance.instanceId, "Native node setup failed.", "error");
                            this.updateInstance(instance.instanceId, { error: "Native node setup failed." });
                        }
                    }
                } else {
                    // instance.internalState.needsAudioNodeSetup is FALSE.
                    // Node is already set up and audio is on. DO NOTHING.
                }
            } else {
                // Context is RUNNING (guaranteed by outer guard) BUT Global Audio is OFF.
                if (definition.runsAtAudioRate && !instance.internalState.needsAudioNodeSetup) { // Check definition.runsAtAudioRate here
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

    public updateAudioNodeParameters(blockInstances: BlockInstance[], connections: Connection[], globalBpm: number) {
        if (!Tone.getContext() || Tone.getContext().state !== 'running') return;

        blockInstances.forEach(instance => {
            const definition = BlockStateManager.getDefinitionForBlock(instance);
            if (!definition || !definition.runsAtAudioRate || instance.internalState.needsAudioNodeSetup || definition.id === LyriaMasterBlock.getDefinition().id) {
                return;
            }

            if (definition.audioWorkletProcessorName) {
                AudioWorkletManager.updateManagedAudioWorkletNodeParams(instance.instanceId, instance.parameters);
            } else {
                const currentInputsForParamUpdate: Record<string, any> = {};
                if (definition.id === NUMBER_TO_CONSTANT_AUDIO_BLOCK_DEFINITION.id) {
                    const inputPort = definition.inputs.find(ip => ip.id === 'number_in');
                    if (inputPort) {
                        const conn = connections.find(c => c.toInstanceId === instance.instanceId && c.toInputId === inputPort.id);
                        if (conn) {
                            const sourceInstance = blockInstances.find(bi => bi.instanceId === conn.fromInstanceId);
                            currentInputsForParamUpdate[inputPort.id] = sourceInstance?.lastRunOutputs?.[conn.fromOutputId] ?? getDefaultOutputValue(inputPort.type);
                        } else {
                            currentInputsForParamUpdate[inputPort.id] = getDefaultOutputValue(inputPort.type);
                        }
                    }
                }
                NativeNodeManager.updateManagedNativeNodeParams?.(
                    instance.instanceId,
                    instance.parameters,
                    Object.keys(currentInputsForParamUpdate).length > 0 ? currentInputsForParamUpdate : undefined,
                    globalBpm
                );
            }
        });
    }

    public manageLyriaServiceUpdates(
        blockInstances: BlockInstance[],
        connections: Connection[],
        isAudioGloballyEnabled: boolean,
    ) {
        // Check Tone.js context state for Lyria Service updates, as it might interact with audio scheduling
        if (!Tone.getContext() || !LyriaServiceManager) return;

        blockInstances.forEach(instance => {
            const definition = BlockStateManager.getDefinitionForBlock(instance);
            if (!definition || definition.id !== LyriaMasterBlock.getDefinition().id) return;

            const service = LyriaServiceManager;
            const servicePlaybackState = service?.getPlaybackState();
            const isServiceEffectivelyPlaying = servicePlaybackState === PlaybackState.PLAYING || servicePlaybackState === PlaybackState.LOADING;

            // Auto-play logic
            if (instance.internalState.lyriaServiceReady &&
                isAudioGloballyEnabled &&
                !isServiceEffectivelyPlaying &&
                !instance.internalState.autoPlayInitiated &&
                !instance.internalState.playRequest &&
                !instance.internalState.stopRequest &&
                !instance.internalState.pauseRequest) {
                this.addLog(instance.instanceId, `AudioNodeManager triggering auto-play for Lyria block: ${instance.name}`);
                console.log(instance.instanceId, `AudioNodeManager triggering auto-play for Lyria block: ${instance.name}`);
                this.updateInstance(instance.instanceId, currentInst => ({
                    ...currentInst,
                    internalState: { ...currentInst.internalState, playRequest: true, autoPlayInitiated: true }
                }));
            }

            // Reset autoPlayInitiated on stop
            if (instance.internalState.stopRequest && instance.internalState.autoPlayInitiated) {
                this.updateInstance(instance.instanceId, currentInst => ({
                    ...currentInst,
                    internalState: { ...currentInst.internalState, autoPlayInitiated: false }
                }));
            }

            // Sync isPlaying state
            if (instance.internalState.isPlaying !== isServiceEffectivelyPlaying) {
                this.updateInstance(instance.instanceId, prevState => ({
                    ...prevState,
                    internalState: { ...prevState.internalState, isPlaying: isServiceEffectivelyPlaying }
                }));
            }

            // Update Lyria service state (params, inputs, internal commands)
            if (isAudioGloballyEnabled) {
                const blockParams: Record<string, any> = {};
                instance.parameters.forEach(p => blockParams[p.id] = p.currentValue);

                const blockInputs: Record<string, any> = {};
                definition.inputs.forEach(inputPort => {
                    const conn = connections.find(c => c.toInstanceId === instance.instanceId && c.toInputId === inputPort.id);
                    if (conn) {
                        const sourceInstance = blockInstances.find(bi => bi.instanceId === conn.fromInstanceId);
                        blockInputs[inputPort.id] = sourceInstance?.lastRunOutputs?.[conn.fromOutputId] ?? getDefaultOutputValue(inputPort.type);
                    } else {
                        blockInputs[inputPort.id] = getDefaultOutputValue(inputPort.type);
                    }
                });

                LyriaServiceManager.updateLyriaServiceState(
                    instance.instanceId,
                    instance.internalState,
                    blockParams,
                    blockInputs,
                    () => { // onProcessedCallback
                        this.updateInstance(instance.instanceId, prevState => ({
                            ...prevState,
                            internalState: {
                                ...prevState.internalState,
                                playRequest: false, pauseRequest: false, stopRequest: false, reconnectRequest: false,
                                configUpdateNeeded: false, promptsUpdateNeeded: false, trackMuteUpdateNeeded: false,
                            }
                        }));
                    }
                );
            }
        });
    }

    public updateAudioGraphConnections(
        connections: Connection[],
        blockInstances: BlockInstance[],
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
