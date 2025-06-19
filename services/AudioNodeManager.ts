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
import AudioEngineServiceInstance from './AudioEngineService'; // Corrected import
import { BlockInstance, BlockDefinition, Connection, PlaybackState } from '@interfaces/common';
import { BlockStateManager, getDefaultOutputValue } from '@state/BlockStateManager';
import { NUMBER_TO_CONSTANT_AUDIO_BLOCK_DEFINITION } from '@constants/constants'; 
// import { LYRIA_MASTER_BLOCK_DEFINITION } from '@constants/lyria'; // Removed
import { LyriaMasterBlock } from './lyria-blocks/LyriaMaster'; // Added


export class AudioNodeManager {
    private audioEngineService: typeof AudioEngineServiceInstance; // Corrected type
    private blockStateManager: BlockStateManager; // For updating instance state & logging
    private readonly getDefinitionByIdCallback: (definitionId: string) => BlockDefinition | undefined;

    constructor(
        passedAudioEngineService: typeof AudioEngineServiceInstance, // Corrected param type and name
        blockStateManager: BlockStateManager,
        getDefinitionByIdFunc: (definitionId: string) => BlockDefinition | undefined
    ) {
        this.audioEngineService = passedAudioEngineService; // Use passed instance
        this.blockStateManager = blockStateManager;
        this.getDefinitionByIdCallback = getDefinitionByIdFunc;
    }

    // Helper to update instance state and add logs
    private updateInstance(instanceId: string, updates: Partial<BlockInstance> | ((prev: BlockInstance) => BlockInstance)) {
        this.blockStateManager.updateBlockInstance(instanceId, updates);
    }
    private addLog(instanceId: string, message: string, _type: 'info' | 'warn' | 'error' = 'info') {
        // _type is not used by BlockStateManager.addLogToBlockInstance
        this.blockStateManager.addLogToBlockInstance(instanceId, message);
    }
    private getDefinition(instance: BlockInstance): BlockDefinition | undefined {
        return this.getDefinitionByIdCallback(instance?.definitionId);
    }

    public async processAudioNodeSetupAndTeardown(
        blockInstances: BlockInstance[],
        globalBpm: number,
        isAudioGloballyEnabled: boolean,
        isWorkletSystemReady: boolean,
        audioContextCurrent: Tone.BaseContext
    ) {
        console.log('[AudioNodeManager processAudioNodeSetupAndTeardown] Entry. GlobalAudioEnabled:', isAudioGloballyEnabled, 'WorkletSystemReady:', isWorkletSystemReady, 'AudioContext State:', audioContextCurrent?.state);
        console.log('[AudioNodeManager processAudioNodeSetupAndTeardown] Number of blockInstances received:', blockInstances.length);
        if (blockInstances.length > 0) {
          console.log('[AudioNodeManager processAudioNodeSetupAndTeardown] Instance IDs:', blockInstances.map(inst => inst.instanceId));
        }
        // console.log(`[AudioNodeManager DEBUG] Entered processAudioNodeSetupAndTeardown. GlobalAudioEnabled: ${isAudioGloballyEnabled}, WorkletSystemReady: ${isWorkletSystemReady}, AudioContext State: ${audioContextCurrent?.state}`);
        if (audioContextCurrent?.rawContext) { // More robust check for valid context objects
            blockInstances.forEach(instance => {
                // console.log(`[AudioNodeManager DEBUG] Processing instance (no audio context): ${instance.instanceId}, Def ID: ${instance.definitionId}`);
                const definition = this.getDefinition(instance);
                if (definition && definition.runsAtAudioRate && !instance.internalState.needsAudioNodeSetup) {
                    // Node was set up, but audio context is now gone. Mark for setup and log if not already.
                    const needsToLog = !instance.internalState.loggedAudioSystemNotActive;
                    this.updateInstance(instance.instanceId, currentInst => ({
                        ...currentInst,
                        internalState: {
                            ...currentInst.internalState,
                            needsAudioNodeSetup: true,
                            lyriaServiceReady: false, // Reset related flags
                            autoPlayInitiated: false,
                            loggedAudioSystemNotActive: true // Set the flag
                        }
                    }));
                    if (needsToLog) {
                        this.addLog(instance.instanceId, "Audio system (AudioContext) not available. Node requires setup.", "warn");
                        console.warn(instance.instanceId, "Audio system (AudioContext) not available. Node requires setup.", "warn");
                    }
                }
            });
            // return; // Removed to allow processing to continue
        }

        // Determine the actual usable AudioContext (native) or null
        const usableContext = (audioContextCurrent as Tone.Context).rawContext;

        if (!usableContext) { // If after all checks, we don't have a usable AudioContext
            blockInstances.forEach(instance => {
                // console.log(`[AudioNodeManager DEBUG] Processing instance (no audio context): ${instance.instanceId}, Def ID: ${instance.definitionId}`);
                const definition = this.getDefinition(instance);
                if (definition && definition.runsAtAudioRate && !instance.internalState.needsAudioNodeSetup) {
                    // Node was set up, but audio context is now gone. Mark for setup and log if not already.
                    const needsToLog = !instance.internalState.loggedAudioSystemNotActive;
                    this.updateInstance(instance.instanceId, currentInst => ({
                        ...currentInst,
                        internalState: {
                            ...currentInst.internalState,
                            needsAudioNodeSetup: true,
                            lyriaServiceReady: false, // Reset related flags
                            autoPlayInitiated: false,
                            loggedAudioSystemNotActive: true // Set the flag
                        }
                    }));
                    if (needsToLog) {
                        this.addLog(instance.instanceId, "Audio system (AudioContext) not available. Node requires setup.", "warn");
                        console.warn(instance.instanceId, "Audio system (AudioContext) not available. Node requires setup.", "warn");
                    }
                }
            });
            return;
        }

        for (const instance of blockInstances) {
            const definition = this.getDefinition(instance);
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
            if (isAudioGloballyEnabled) {
                // Context is RUNNING (guaranteed by outer guard) and Global Audio is ON.
                if (instance.internalState.needsAudioNodeSetup) {
                    // Node needs setup.
                    let setupSuccess = false; // Initialize setupSuccess for this scope
                    if (definition.audioWorkletProcessorName && definition.audioWorkletCode) { // Worklet Node
                        if (isWorkletSystemReady) {
                            if (instance.internalState.loggedWorkletSystemNotReady) {
                                this.updateInstance(instance.instanceId, currentInst => ({
                                    ...currentInst,
                                    internalState: { ...currentInst.internalState, loggedWorkletSystemNotReady: false }
                                }));
                            }
                            this.addLog(instance.instanceId, "Worklet node setup initiated (audio on).");
                            console.log(instance.instanceId, "Worklet node setup initiated (audio on).");
                            setupSuccess = await this.audioEngineService.audioWorkletManager.setupManagedAudioWorkletNode(instance.instanceId, definition, instance.parameters);
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
                        setupSuccess = await this.audioEngineService.addNativeNode(instance.instanceId, definition, instance.parameters, globalBpm);
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

    public updateAudioNodeParameters(
        blockInstances: BlockInstance[],
        connections: Connection[],
        globalBpm: number
    ) {
        // Check Tone.js context state
        if (!Tone.getContext() || Tone.getContext().state !== 'running') return;

        blockInstances.forEach(instance => {
            const definition = this.getDefinition(instance);
            if (!definition || !definition.runsAtAudioRate || instance.internalState.needsAudioNodeSetup || definition.id === LyriaMasterBlock.getDefinition().id) { // Changed
                return;
            }

            if (definition.audioWorkletProcessorName) {
                this.audioEngineService.audioWorkletManager.updateManagedAudioWorkletNodeParams(instance.instanceId, instance.parameters);
            } else { // Native Nodes
                const currentInputsForParamUpdate: Record<string, any> = {};
                // Special handling for NUMBER_TO_CONSTANT_AUDIO_BLOCK_DEFINITION
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
                this.audioEngineService.nativeNodeManager.updateManagedNativeNodeParams?.(
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
        if (!Tone.getContext() || !this.audioEngineService.lyriaServiceManager) return;


        blockInstances.forEach(instance => {
            const definition = this.getDefinition(instance);
            if (!definition || definition.id !== LyriaMasterBlock.getDefinition().id) return; // Changed

            const service = this.audioEngineService.lyriaServiceManager.getLyriaServiceInstance(instance.instanceId);
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

                this.audioEngineService.lyriaServiceManager.updateLyriaServiceState(
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
            this.audioEngineService.updateAudioGraphConnections(connections, blockInstances, (inst) => this.getDefinition(inst));
        } else {
            // Clear connections if audio is disabled
            this.audioEngineService.updateAudioGraphConnections([], blockInstances, (inst) => this.getDefinition(inst));
        }
    }
}
