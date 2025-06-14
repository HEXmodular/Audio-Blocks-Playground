/**
 * This service manages instances of `LiveMusicService`, which interface with Google's Lyria AI for real-time music generation, associating them with specific block instances in the application.
 * It handles the complete lifecycle of these Lyria service instances, including their setup (which involves creating, configuring, and connecting the `LiveMusicService` to the backend and the application's audio graph via the master gain node) and their removal.
 * A core function is `updateLyriaServiceState`, which translates block-level parameters, inputs (including CVs for scale, brightness, etc.), and internal state requests (like play, stop, reconnect, or prompt updates) into direct commands and configuration changes for the underlying `LiveMusicService`.
 * The manager ensures that each Lyria block's audio output is correctly routed and that callbacks are in place to react to changes in the Lyria service's state, triggering application-level updates.
 * It acts as the specialized controller for all Lyria AI-powered music generation blocks within the system.
 */
import {
    BlockDefinition,
    LiveMusicGenerationConfig,
    PlaybackState,
    ManagedLyriaServiceInfo // Import from common
} from '@interfaces/common';
import { LiveMusicService, LiveMusicServiceCallbacks, DEFAULT_MUSIC_GENERATION_CONFIG } from '@services/LiveMusicService';
import { Scale as GenAIScale } from '@google/genai';

// Local definition of ManagedLyriaServiceInfo removed.

export interface ILyriaServiceManager {
    setupLyriaServiceForInstance: (instanceId: string, definition: BlockDefinition, addBlockLog: (message: string) => void) => Promise<boolean>;
    removeLyriaServiceForInstance: (instanceId: string) => void;
    getLyriaServiceInstance: (instanceId: string) => LiveMusicService | null;
    updateLyriaServiceState: (instanceId: string, blockInternalState: Record<string, any>, blockParams: Record<string,any>, blockInputs: Record<string,any>, clearRequestsFn: () => void) => void;
    removeAllManagedLyriaServices: () => void;
}

export class LyriaServiceManager implements ILyriaServiceManager {
    private managedLyriaServiceInstancesRef: Map<string, ManagedLyriaServiceInfo>;
    private audioContext: AudioContext | null;
    private masterGainNode: GainNode | null;
    private readonly onStateChangeForReRender: () => void;

    constructor(
        // Removed audioContext and masterGainNode from constructor params as they are set via _setAudioContextAndMasterGain
        onStateChangeForReRender: () => void,
        initialAudioContext: AudioContext | null = null, // Optional initial context
        initialMasterGainNode: GainNode | null = null    // Optional initial gain
    ) {
        this.audioContext = initialAudioContext;
        this.masterGainNode = initialMasterGainNode;
        this.onStateChangeForReRender = onStateChangeForReRender;
        this.managedLyriaServiceInstancesRef = new Map<string, ManagedLyriaServiceInfo>();
    }

    public _setAudioContextAndMasterGain(newContext: AudioContext | null, newMasterGainNode: GainNode | null): void {
        let contextChanged = false;
        if (this.audioContext !== newContext) {
            contextChanged = true;
            if (this.managedLyriaServiceInstancesRef.size > 0) {
                console.log("[LyriaManager] AudioContext changed/nulled. Removing all existing managed Lyria services.", true);
                this.removeAllManagedLyriaServices();
            }
            this.audioContext = newContext;
        }
        this.masterGainNode = newMasterGainNode;
        if (contextChanged) {
            this.onStateChangeForReRender();
        }
    }

    public async setupLyriaServiceForInstance(
        instanceId: string,
        definition: BlockDefinition,
        addBlockLog: (message: string) => void
    ): Promise<boolean> {
        console.log("setupLyriaServiceForInstance")
        if (!this.audioContext || this.audioContext.state !== 'running') {
            addBlockLog(`[LyriaManager Setup] Lyria Service setup failed: AudioContext not ready (state: ${this.audioContext?.state}).`);
            return false;
        }
        if (typeof process === 'undefined' || !process.env.API_KEY) {
             addBlockLog("[LyriaManager Setup] Lyria Service setup failed: API_KEY not configured (Note: process.env access from class has limitations).");
            return false;
        }
        if (this.managedLyriaServiceInstancesRef.has(instanceId)) {
            addBlockLog("[LyriaManager Setup] Lyria Service already initialized for this block.");
            const existingServiceInfo = this.managedLyriaServiceInstancesRef.get(instanceId);
            if (existingServiceInfo && this.masterGainNode && existingServiceInfo.outputNode !== this.masterGainNode) {
                 try { existingServiceInfo.outputNode.disconnect(); } catch (e) { /*ignore*/ }
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
                } else if (this.masterGainNode) {
                    try { newNode.connect(this.masterGainNode); }
                    catch (e) { console.log(`[LyriaManager Error] Connecting new Lyria output (no service info) for ${instanceId} to master gain: ${(e as Error).message}`, true); }
                }
                this.onStateChangeForReRender();
            },
        };

        try {
            const service = LiveMusicService.getInstance(process.env.API_KEY!, this.audioContext, serviceCallbacks, initialMusicConfig);
            const lyriaOutputNode = service.getOutputNode();
            if (this.masterGainNode) {
                lyriaOutputNode.connect(this.masterGainNode);
            }
            this.managedLyriaServiceInstancesRef.set(instanceId, { instanceId, service, outputNode: lyriaOutputNode, definition }); // Added definition
            addBlockLog("[LyriaManager Setup] Lyria Service initialized and output connected.");
            await service.connect();
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
                info.outputNode.disconnect();
            } catch (e) {
                if (!(e instanceof DOMException && e.name === 'InvalidAccessError')) {
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
        if (!service) return;

        if (blockInternalState.reconnectRequest) service.reconnect();
        else if (blockInternalState.stopRequest) {
            service.stop();
            if (blockInternalState.playRequest) service.play(blockInternalState.lastEffectivePrompts);
        } else if (blockInternalState.playRequest) service.play(blockInternalState.lastEffectivePrompts || []);
        else if (blockInternalState.pauseRequest) service.pause();

        if (service.isConnected() || service.getPlaybackState() === PlaybackState.PAUSED) {
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
                else if (blockParams.seed === 0) newConfig.seed = undefined;

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
        this.onStateChangeForReRender();
    }

    public removeAllManagedLyriaServices(): void {
        this.managedLyriaServiceInstancesRef.forEach((_, instanceId) => {
            this.removeLyriaServiceForInstance(instanceId);
        });
        console.log("[LyriaManager] All managed Lyria services removed.", true);
    }

    public getManagedInstancesMap(): Map<string, ManagedLyriaServiceInfo> {
        return this.managedLyriaServiceInstancesRef;
    }
}
