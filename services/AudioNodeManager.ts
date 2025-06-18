// Force recompile to address potential caching issue with async keyword detection
/**
 * This service orchestrates the lifecycle and parameterization of audio nodes within a block-based audio graph.
 * It acts as an intermediary between high-level block instance representations and the underlying `AudioEngineService`, translating block configurations into concrete audio node setups and updates.
 * Key responsibilities include processing the setup and teardown of various audio nodes (AudioWorklets, native Web Audio nodes, and Lyria services) based on global audio state and block definitions.
 * The manager also handles real-time updates to audio node parameters, manages specialized updates for Lyria services (like auto-play and state synchronization), and triggers updates to the overall audio graph connections.
 * It utilizes a `BlockStateManager` for logging and persisting state changes to block instances, ensuring the application's view of the audio graph remains consistent with the audio engine's state.
 */
// services/AudioNodeManager.ts
import { AudioEngineService } from './AudioEngineService';
import { BlockInstance, BlockDefinition, Connection, PlaybackState } from '@interfaces/common';
import { BlockStateManager, getDefaultOutputValue } from '@state/BlockStateManager';
import { NUMBER_TO_CONSTANT_AUDIO_BLOCK_DEFINITION } from '@constants/constants'; 
// import { LYRIA_MASTER_BLOCK_DEFINITION } from '@constants/lyria'; // Removed
import { LyriaMasterBlock } from './lyria-blocks/LyriaMaster'; // Added


export class AudioNodeManager {
    private audioEngineService: AudioEngineService;
    private blockStateManager: BlockStateManager; // For updating instance state & logging
    private readonly getDefinitionByIdCallback: (definitionId: string) => BlockDefinition | undefined;

    constructor(
        audioEngineService: AudioEngineService,
        blockStateManager: BlockStateManager,
        getDefinitionByIdFunc: (definitionId: string) => BlockDefinition | undefined
    ) {
        this.audioEngineService = audioEngineService;
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
        return this.getDefinitionByIdCallback(instance.definitionId);
    }

    public async processAudioNodeSetupAndTeardown(
        blockInstances: BlockInstance[],
        globalBpm: number,
        isAudioGloballyEnabled: boolean,
        isWorkletSystemReady: boolean,
        audioContextCurrent: AudioContext | null
    ) {
        // console.log(`[AudioNodeManager DEBUG] Entered processAudioNodeSetupAndTeardown. GlobalAudioEnabled: ${isAudioGloballyEnabled}, WorkletSystemReady: ${isWorkletSystemReady}, AudioContext State: ${audioContextCurrent?.state}`);
        if (!audioContextCurrent) { // Audio system not ready at all
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
            // console.log(`[AudioNodeManager DEBUG] Processing instance: ${instance.instanceId}, Def ID: ${instance.definitionId}`);
            const definition = this.getDefinition(instance);
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

            // Use Tone.getContext() for state checking, assuming AudioContextService has initialized it.
            const isToneContextRunning = Tone.getContext() && Tone.getContext().state === 'running';

            if (isToneContextRunning && isAudioGloballyEnabled) {
                if (definition.audioWorkletProcessorName && definition.audioWorkletCode) { // Added audioWorkletCode check for consistency
                    // console.log(`[AudioNodeManager DEBUG]   Decision: Will attempt to call audioWorkletManager.setupManagedAudioWorkletNode for ${instance.instanceId}`);
                    if (instance.internalState.needsAudioNodeSetup && isWorkletSystemReady) {
                        // Reset loggedWorkletSystemNotReady if it was previously set, as we are now ready
                        if (instance.internalState.loggedWorkletSystemNotReady) {
                            this.updateInstance(instance.instanceId, currentInst => ({
                                ...currentInst,
                                internalState: { ...currentInst.internalState, loggedWorkletSystemNotReady: false }
                            }));
                        }
                        this.addLog(instance.instanceId, "Worklet node setup initiated by AudioNodeManager.");
                        console.log(instance.instanceId, "Worklet node setup initiated by AudioNodeManager.");
                        // const node = this.audioEngineService.addManagedAudioWorkletNode(instance.instanceId, { processorName: definition.audioWorkletProcessorName, nodeOptions: instance.parameters });
                        // The actual call to audioEngineService.audioWorkletManager.setupManagedAudioWorkletNode is expected to be within audioEngineService.addManagedAudioWorkletNode
                        // For now, we assume addManagedAudioWorkletNode in AudioEngineService does the right thing.
                        // The plan asks to log the decision, the actual call is below this logging block.
                        const setupSuccess = await this.audioEngineService.audioWorkletManager.setupManagedAudioWorkletNode(instance.instanceId, definition, instance.parameters);

                        if (setupSuccess) {
                            this.updateInstance(instance.instanceId, currentInst => ({
                                ...currentInst,
                                internalState: {
                                    ...currentInst.internalState,
                                    needsAudioNodeSetup: false,
                                    loggedAudioSystemNotActive: false
                                }
                            }));
                            this.addLog(instance.instanceId, "Worklet node setup successful.");
                            console.log(instance.instanceId, "Worklet node setup successful.");
                            // Specific connection for AUDIO_OUTPUT_BLOCK_DEFINITION is now handled in AudioEngineService's updateAudioGraphConnections
                        } else {
                            console.error("Worklet node setup failed.", "error", instance);
                            this.addLog(instance.instanceId, "Worklet node setup failed.", "error");
                            this.updateInstance(instance.instanceId, { error: "Worklet node setup failed." });
                        }
                    } else if (instance.internalState.needsAudioNodeSetup && !isWorkletSystemReady) {
                        if (!instance.internalState.loggedWorkletSystemNotReady) {
                            this.addLog(instance.instanceId, "Worklet system not ready, deferring setup.", "warn");
                            console.warn(instance.instanceId, "Worklet system not ready, deferring setup.", "warn")
                            this.updateInstance(instance.instanceId, currentInst => ({
                                ...currentInst,
                                internalState: { ...currentInst.internalState, loggedWorkletSystemNotReady: true }
                            }));
                        }
                    }
                }
                // Setup Native Audio Node
                // Assuming isNativeNodeDefinition can be implemented by checking !definition.audioWorkletProcessorName and not Lyria
                else if (!definition.audioWorkletProcessorName) { // Changed // Basic check for native
                    // console.log(`[AudioNodeManager DEBUG]   Decision: Will attempt to call audioEngineService.addNativeNode for ${instance.instanceId}`);
                    if (instance.internalState.needsAudioNodeSetup) {
                        this.addLog(instance.instanceId, "Native node setup initiated by AudioNodeManager.");
                        console.log(instance.instanceId, "Native node setup initiated by AudioNodeManager.");
                        const success = await this.audioEngineService.addNativeNode(instance.instanceId, definition, instance.parameters, globalBpm);
                        if (success) {
                            this.updateInstance(instance.instanceId, currentInst => ({
                                ...currentInst,
                                internalState: {
                                    ...currentInst.internalState,
                                    needsAudioNodeSetup: false,
                                    loggedAudioSystemNotActive: false
                                }
                            }));
                            this.addLog(instance.instanceId, "Native node setup successful.");
                            console.log(instance.instanceId, "Native node setup successful.")
                        } else {
                            console.error(instance.instanceId, "Native node setup failed.", "error");
                            this.addLog(instance.instanceId, "Native node setup failed.", "error");
                            this.updateInstance(instance.instanceId, { error: "Native node setup failed." });
                        }
                    }
                } else {
                     // console.log(`[AudioNodeManager DEBUG]   Decision: Runs at audio rate but not worklet, native, or Lyria. SKIPPING setup for ${instance.instanceId}. Def ID: ${definition.id}`);
                }
            } else if (definition.runsAtAudioRate && !instance.internalState.needsAudioNodeSetup) {
                 // console.log(`[AudioNodeManager DEBUG]   Instance ${instance.instanceId} runs at audio rate, was set up, but audio system not active. Marking for re-setup.`);
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
                    this.addLog(instance.instanceId, "Audio system not active. Node now requires setup.", "warn");
                    console.warn(instance.instanceId, "Audio system not active. Node now requires setup.", "warn");
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
