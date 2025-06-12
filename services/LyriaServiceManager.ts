/**
 * This service manages instances of `LiveMusicService`, which interface with Google's Lyria AI for real-time music generation, associating them with specific block instances in the application.
 * It handles the complete lifecycle of these Lyria service instances, including their setup (which involves creating, configuring, and connecting the `LiveMusicService` to the backend and the application's audio graph via the master gain node) and their removal.
 * A core function is `updateLyriaServiceState`, which translates block-level parameters, inputs (including CVs for scale, brightness, etc.), and internal state requests (like play, stop, reconnect, or prompt updates) into direct commands and configuration changes for the underlying `LiveMusicService`.
 * The manager ensures that each Lyria block's audio output is correctly routed and that callbacks are in place to react to changes in the Lyria service's state, triggering application-level updates.
 * It acts as the specialized controller for all Lyria AI-powered music generation blocks within the system.
 */
import { BlockDefinition, LiveMusicGenerationConfig } from '@interfaces/common'; // Adjusted as WeightedPrompt is used by LiveMusicService
import { LiveMusicService, LiveMusicServiceCallbacks, DEFAULT_MUSIC_GENERATION_CONFIG } from '@services/LiveMusicService';
import { Scale as GenAIScale } from '@google/genai'; // GenAIScale is used in updateLyriaServiceState

export type ManagedLyriaServiceInfo = {
    instanceId: string;
    service: LiveMusicService;
    outputNode: AudioNode;
};

export interface ILyriaServiceManager {
    setupLyriaServiceForInstance: (instanceId: string, definition: BlockDefinition, addBlockLog: (message: string) => void) => Promise<boolean>;
    removeLyriaServiceForInstance: (instanceId: string) => void;
    getLyriaServiceInstance: (instanceId: string) => LiveMusicService | null;
    updateLyriaServiceState: (instanceId: string, blockInternalState: Record<string, any>, blockParams: Record<string,any>, blockInputs: Record<string,any>, clearRequestsFn: () => void) => void;
    removeAllManagedLyriaServices: () => void;
    // managedLyriaServiceInstancesRef will be a private property, so it's not part of the public interface.
}

export class LyriaServiceManager implements ILyriaServiceManager {
    private managedLyriaServiceInstancesRef: Map<string, ManagedLyriaServiceInfo>;

    private audioContext: AudioContext | null;
    private masterGainNode: GainNode | null;
    private readonly onStateChangeForReRender: () => void;

    constructor(
        audioContext: AudioContext | null,
        masterGainNode: GainNode | null,
        onStateChangeForReRender: () => void,
    ) {
        this.audioContext = audioContext;
        this.masterGainNode = masterGainNode;
        this.onStateChangeForReRender = onStateChangeForReRender;
        this.managedLyriaServiceInstancesRef = new Map<string, ManagedLyriaServiceInfo>();
    }

    /**
     * Allows AudioEngine to update the AudioContext and MasterGainNode for this manager.
     * @param newContext The new AudioContext, or null.
     * @param newMasterGainNode The new MasterGainNode, or null.
     */
    public _setAudioContextAndMasterGain(newContext: AudioContext | null, newMasterGainNode: GainNode | null): void {
        let contextChanged = false;
        if (this.audioContext !== newContext) {
            contextChanged = true;
            if (this.managedLyriaServiceInstancesRef.size > 0) {
                console.log("[LyriaManager] AudioContext changed/nulled. Removing all existing managed Lyria services.", true);
                this.removeAllManagedLyriaServices(); // Clears services and the map
            }
            this.audioContext = newContext;
        }

        this.masterGainNode = newMasterGainNode; // Update masterGainNode regardless

        // If context changed, it might affect overall state, trigger re-render
        if (contextChanged) {
            this.onStateChangeForReRender();
        }
        // Note: If masterGainNode changes, existing service output nodes might need re-connection.
        // This is partially handled in setupLyriaServiceForInstance if an instance is re-setup,
        // and by onOutputNodeChanged callback. A more direct re-patching could be added here if needed for all existing services.
    }

    public async setupLyriaServiceForInstance(
        instanceId: string,
        definition: BlockDefinition, // definition is not directly used in the original hook's logic but kept for signature consistency
        addBlockLog: (message: string) => void
    ): Promise<boolean> {
        console.log("setupLyriaServiceForInstance")
        if (!this.audioContext || this.audioContext.state !== 'running') {
            addBlockLog(`[LyriaManager Setup] Lyria Service setup failed: AudioContext not ready (state: ${this.audioContext?.state}).`);
            return false;
        }
        // Assuming API_KEY is available in the environment. The class cannot directly access process.env.
        // This check might need to be handled by the consumer of the class or passed in if it's dynamic.
        // For now, we'll replicate the hook's assumption that it's globally available via process.env.
        // In a pure class model, this would ideally be passed in or handled differently.
        if (typeof process === 'undefined' || !process.env.API_KEY) {
             addBlockLog("[LyriaManager Setup] Lyria Service setup failed: API_KEY not configured (Note: process.env access from class has limitations).");
            // Consider how API_KEY should be provided to the class instance if not via process.env directly.
            // This might be an architectural consideration for the larger application.
            return false;
        }
        if (this.managedLyriaServiceInstancesRef.has(instanceId)) {
            addBlockLog("[LyriaManager Setup] Lyria Service already initialized for this block.");
            const existingServiceInfo = this.managedLyriaServiceInstancesRef.get(instanceId);
            // Re-connect if masterGainNode is available and output is not already connected to it.
            if (existingServiceInfo && this.masterGainNode && existingServiceInfo.outputNode !== this.masterGainNode) {
                 try { existingServiceInfo.outputNode.disconnect(); } catch (e) { /*ignore*/ } // Disconnect from wherever it was
                try { existingServiceInfo.outputNode.connect(this.masterGainNode); }
                catch (e) { console.log(`[LyriaManager Error] Re-connecting existing Lyria output for ${instanceId} to master gain: ${(e as Error).message}`, true); }
            }
            return true;
        }

        const initialMusicConfig: Partial<LiveMusicGenerationConfig> = { ...DEFAULT_MUSIC_GENERATION_CONFIG };
        const serviceCallbacks: LiveMusicServiceCallbacks = {
            onPlaybackStateChange: (newState) => { addBlockLog(`Lyria playback state: ${newState}`); this.onStateChangeForReRender(); },
            onFilteredPrompt: (promptInfo) => addBlockLog(`Lyria prompt filtered: "${promptInfo.text}", Reason: ${promptInfo.filteredReason}`),
            onSetupComplete: () => { addBlockLog("Lyria Service setup complete and ready."); this.onStateChangeForReRender(); },
            onError: (error) => { addBlockLog(`Lyria Service Error: ${error}`); this.onStateChangeForReRender(); },
            onClose: (message) => { addBlockLog(`Lyria Service closed: ${message}`); this.onStateChangeForReRender(); },
            onOutputNodeChanged: (newNode) => {
                console.log(`[LyriaManager] Lyria Service output node changed for ${instanceId}. Updating connections.`, true);
                const lyriaServiceInfo = this.managedLyriaServiceInstancesRef.get(instanceId);
                if (lyriaServiceInfo && this.masterGainNode) {
                    const oldNode = lyriaServiceInfo.outputNode;
                    this.managedLyriaServiceInstancesRef.set(instanceId, { ...lyriaServiceInfo, outputNode: newNode });
                    if (oldNode && oldNode !== newNode) {
                        try { oldNode.disconnect(this.masterGainNode); } catch (e) { /* ignore */ }
                    }
                    try { newNode.connect(this.masterGainNode); }
                    catch (e) { console.log(`[LyriaManager Error] Connecting new Lyria output for ${instanceId} to master gain: ${(e as Error).message}`, true); }
                } else if (this.masterGainNode) { // if lyriaServiceInfo is somehow not found but we have a masterGainNode
                    try { newNode.connect(this.masterGainNode); }
                    catch (e) { console.log(`[LyriaManager Error] Connecting new Lyria output (no service info) for ${instanceId} to master gain: ${(e as Error).message}`, true); }
                }
                this.onStateChangeForReRender();
            },
        };

        try {
            // Again, process.env.API_KEY access here.
            const service = new LiveMusicService(process.env.API_KEY!, this.audioContext, serviceCallbacks, initialMusicConfig);
            const lyriaOutputNode = service.getOutputNode();
            if (this.masterGainNode) {
                lyriaOutputNode.connect(this.masterGainNode);
            }
            this.managedLyriaServiceInstancesRef.set(instanceId, { instanceId, service, outputNode: lyriaOutputNode });
            addBlockLog("[LyriaManager Setup] Lyria Service initialized and output connected.");
            await service.connect(); // Ensure service connection is attempted
            this.onStateChangeForReRender();
            return true;
        } catch (error: any) {
            addBlockLog(`[LyriaManager Setup] Failed to initialize Lyria Service: ${error.message}`);
            this.onStateChangeForReRender();
            return false;
        }
    }

    public removeLyriaServiceForInstance(instanceId: string): void {
        const info = this.managedLyriaServiceInstancesRef.get(instanceId);
        if (info) {
            info.service.dispose();
            try {
                if (this.masterGainNode && info.outputNode) {
                    try { info.outputNode.disconnect(this.masterGainNode); }
                    catch (eInnerMaster) { /* console.warn(`[LyriaManager Remove] Inner disconnect error for Lyria output from masterGain: ${eInnerMaster.message}`); */ }
                }
                // Attempt to disconnect from any other connections as well
                info.outputNode.disconnect();
            } catch (e) {
                // Only log if the general disconnect fails, as disconnecting from masterGainNode might have already handled it or it wasn't connected.
                if (!(e instanceof DOMException && e.name === 'InvalidAccessError')) { // Avoid logging if already disconnected
                    console.log(`[LyriaManager Remove] Error disconnecting Lyria service outputNode for '${instanceId}': ${(e as Error).message}`, true);
                }
            }
            this.managedLyriaServiceInstancesRef.delete(instanceId);
            console.log(`[LyriaManager Remove] Lyria Service for instance '${instanceId}' disposed and removed.`, true);
            this.onStateChangeForReRender();
        }
    }

    public getLyriaServiceInstance(instanceId: string): LiveMusicService | null {
        return this.managedLyriaServiceInstancesRef.get(instanceId)?.service || null;
    }

    public updateLyriaServiceState(
        instanceId: string,
        blockInternalState: Record<string, any>,
        blockParams: Record<string, any>,
        blockInputs: Record<string, any>,
        clearRequestsFn: () => void
    ): void {
        const service = this.getLyriaServiceInstance(instanceId);
        // audioContext check is implicitly handled by service's own checks if needed for specific operations,
        // but good to ensure service exists.
        if (!service) return;

        if (blockInternalState.reconnectRequest) service.reconnect();
        else if (blockInternalState.stopRequest) {
            service.stop();
            if (blockInternalState.playRequest) service.play(blockInternalState.lastEffectivePrompts);
        } else if (blockInternalState.playRequest) service.play(blockInternalState.lastEffectivePrompts || []);
        else if (blockInternalState.pauseRequest) service.pause();

        if (service.isConnected() || service.getPlaybackState() === PlaybackState.PAUSED) { // Used PlaybackState enum
            if (blockInternalState.configUpdateNeeded) {
                const newConfig: Partial<LiveMusicGenerationConfig> = {};
                if (blockInputs.scale_cv_in !== undefined && blockInputs.scale_cv_in !== null && Object.values(GenAIScale).includes(blockInputs.scale_cv_in as any)) newConfig.scale = blockInputs.scale_cv_in as GenAIScale;
                else if (blockParams.scale !== undefined && Object.values(GenAIScale).includes(blockParams.scale as any)) newConfig.scale = blockParams.scale as GenAIScale;

                if (blockInputs.brightness_cv_in !== undefined) newConfig.brightness = Number(blockInputs.brightness_cv_in);
                else if (blockParams.brightness !== undefined) newConfig.brightness = Number(blockParams.brightness);

                if (blockInputs.density_cv_in !== undefined) newConfig.density = Number(blockInputs.density_cv_in);
                else if (blockParams.density !== undefined) newConfig.density = Number(blockParams.density);

                if (blockInputs.seed_cv_in !== undefined) newConfig.seed = Math.floor(Number(blockInputs.seed_cv_in));
                else if (blockParams.seed !== undefined && Number(blockParams.seed) !== 0) newConfig.seed = Math.floor(Number(blockParams.seed));
                else if (blockParams.seed === 0) newConfig.seed = undefined; // Allow unsetting seed

                if (blockInputs.temperature_cv_in !== undefined) newConfig.temperature = Number(blockInputs.temperature_cv_in);
                else if (blockParams.temperature !== undefined) newConfig.temperature = Number(blockParams.temperature);

                if (blockInputs.guidance_cv_in !== undefined) newConfig.guidance = Number(blockInputs.guidance_cv_in);
                else if (blockParams.guidance_scale !== undefined) newConfig.guidance = Number(blockParams.guidance_scale);

                if (blockInputs.top_k_cv_in !== undefined) newConfig.topK = Math.floor(Number(blockInputs.top_k_cv_in));
                else if (blockParams.top_k !== undefined) newConfig.topK = Math.floor(Number(blockParams.top_k));

                if (blockInputs.bpm_cv_in !== undefined) newConfig.bpm = Math.floor(Number(blockInputs.bpm_cv_in));
                else if (blockParams.bpm !== undefined) newConfig.bpm = Math.floor(Number(blockParams.bpm));

                service.setMusicGenerationConfig(newConfig);
            }
            if (blockInternalState.promptsUpdateNeeded) service.setWeightedPrompts(blockInternalState.lastEffectivePrompts || []);
            if (blockInternalState.trackMuteUpdateNeeded) service.setMusicGenerationConfig({
                muteBass: !!blockInternalState.lastMuteBass,
                muteDrums: !!blockInternalState.lastMuteDrums,
                onlyBassAndDrums: !!blockInternalState.lastOnlyBassDrums
            });
        }
        clearRequestsFn();
        this.onStateChangeForReRender(); // Ensure UI updates based on state changes
    }

    public removeAllManagedLyriaServices(): void {
        this.managedLyriaServiceInstancesRef.forEach((_, instanceId) => {
            this.removeLyriaServiceForInstance(instanceId); // Call the class method
        });
        console.log("[LyriaManager] All managed Lyria services removed.", true);
    }

    public getManagedInstancesMap(): Map<string, ManagedLyriaServiceInfo> {
        return this.managedLyriaServiceInstancesRef;
    }
}
