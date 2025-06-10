import { useCallback, useRef } from 'react';
import { BlockDefinition, LiveMusicGenerationConfig, WeightedPrompt } from '../types';
import { LiveMusicService, LiveMusicServiceCallbacks, PlaybackState, MusicGenerationMode, DEFAULT_MUSIC_GENERATION_CONFIG } from '../services/LiveMusicService';
import { Scale as GenAIScale } from '@google/genai';

export type ManagedLyriaServiceInfo = {
    instanceId: string;
    service: LiveMusicService;
    outputNode: AudioNode;
};

export interface LyriaServiceManager {
    setupLyriaServiceForInstance: (instanceId: string, definition: BlockDefinition, addBlockLog: (message: string) => void) => Promise<boolean>;
    removeLyriaServiceForInstance: (instanceId: string) => void;
    getLyriaServiceInstance: (instanceId: string) => LiveMusicService | null;
    updateLyriaServiceState: (instanceId: string, blockInternalState: Record<string, any>, blockParams: Record<string,any>, blockInputs: Record<string,any>, clearRequestsFn: () => void) => void;
    removeAllManagedLyriaServices: () => void;
    managedLyriaServiceInstancesRef: React.RefObject<Map<string, ManagedLyriaServiceInfo>>;
}

interface UseLyriaServiceManagerProps {
    appLog: (message: string, isSystem?: boolean) => void;
    onStateChangeForReRender: () => void;
    audioContext: AudioContext | null;
    masterGainNode: GainNode | null;
}

export const useLyriaServiceManager = ({
    appLog,
    onStateChangeForReRender,
    audioContext,
    masterGainNode,
}: UseLyriaServiceManagerProps): LyriaServiceManager => {
    const managedLyriaServiceInstancesRef = useRef<Map<string, ManagedLyriaServiceInfo>>(new Map());

    const setupLyriaServiceForInstance = useCallback(async (
        instanceId: string,
        definition: BlockDefinition,
        addBlockLog: (message: string) => void
    ): Promise<boolean> => {
        if (!audioContext || audioContext.state !== 'running') {
            addBlockLog(`[LyriaManager Setup] Lyria Service setup failed: AudioContext not ready (state: ${audioContext?.state}).`);
            return false;
        }
        if (!process.env.API_KEY) {
            addBlockLog("[LyriaManager Setup] Lyria Service setup failed: API_KEY not configured.");
            return false;
        }
        if (managedLyriaServiceInstancesRef.current.has(instanceId)) {
            addBlockLog("[LyriaManager Setup] Lyria Service already initialized for this block.");
            const existingServiceInfo = managedLyriaServiceInstancesRef.current.get(instanceId);
            if (existingServiceInfo && masterGainNode && existingServiceInfo.outputNode !== masterGainNode) {
                try { existingServiceInfo.outputNode.disconnect(); } catch (e) { /*ignore*/ }
                existingServiceInfo.outputNode.connect(masterGainNode);
            }
            return true;
        }

        const initialMusicConfig: Partial<LiveMusicGenerationConfig> = { ...DEFAULT_MUSIC_GENERATION_CONFIG };
        const serviceCallbacks: LiveMusicServiceCallbacks = {
            onPlaybackStateChange: (newState) => { addBlockLog(`Lyria playback state: ${newState}`); onStateChangeForReRender(); },
            onFilteredPrompt: (promptInfo) => addBlockLog(`Lyria prompt filtered: "${promptInfo.text}", Reason: ${promptInfo.filteredReason}`),
            onSetupComplete: () => { addBlockLog("Lyria Service setup complete and ready."); onStateChangeForReRender(); },
            onError: (error) => { addBlockLog(`Lyria Service Error: ${error}`); onStateChangeForReRender(); },
            onClose: (message) => { addBlockLog(`Lyria Service closed: ${message}`); onStateChangeForReRender(); },
            onOutputNodeChanged: (newNode) => {
                appLog(`[LyriaManager] Lyria Service output node changed for ${instanceId}. Updating connections.`, true);
                const lyriaServiceInfo = managedLyriaServiceInstancesRef.current.get(instanceId);
                if (lyriaServiceInfo && masterGainNode) {
                    const oldNode = lyriaServiceInfo.outputNode;
                    managedLyriaServiceInstancesRef.current.set(instanceId, { ...lyriaServiceInfo, outputNode: newNode });
                    if (oldNode && oldNode !== newNode) {
                        try { oldNode.disconnect(masterGainNode); } catch (e) { /* ignore */ }
                    }
                    try { newNode.connect(masterGainNode); }
                    catch (e) { appLog(`[LyriaManager Error] Connecting new Lyria output for ${instanceId} to master gain: ${(e as Error).message}`, true); }
                } else if (masterGainNode) {
                    try { newNode.connect(masterGainNode); }
                    catch (e) { appLog(`[LyriaManager Error] Connecting new Lyria output (no service info) for ${instanceId} to master gain: ${(e as Error).message}`, true); }
                }
                onStateChangeForReRender();
            },
        };

        try {
            const service = new LiveMusicService(process.env.API_KEY, audioContext, serviceCallbacks, initialMusicConfig);
            const lyriaOutputNode = service.getOutputNode();
            if (masterGainNode) {
                lyriaOutputNode.connect(masterGainNode);
            }
            managedLyriaServiceInstancesRef.current.set(instanceId, { instanceId, service, outputNode: lyriaOutputNode });
            addBlockLog("[LyriaManager Setup] Lyria Service initialized and output connected.");
            await service.connect(); // Ensure service connection is attempted
            onStateChangeForReRender();
            return true;
        } catch (error: any) {
            addBlockLog(`[LyriaManager Setup] Failed to initialize Lyria Service: ${error.message}`);
            onStateChangeForReRender();
            return false;
        }
    }, [audioContext, masterGainNode, appLog, onStateChangeForReRender]);

    const removeLyriaServiceForInstance = useCallback((instanceId: string) => {
        const info = managedLyriaServiceInstancesRef.current.get(instanceId);
        if (info) {
            info.service.dispose();
            try {
                if (masterGainNode && info.outputNode) {
                    try { info.outputNode.disconnect(masterGainNode); }
                    catch (eInnerMaster) { /* console.warn(`[LyriaManager Remove] Inner disconnect error for Lyria output from masterGain: ${eInnerMaster.message}`); */ }
                }
                info.outputNode.disconnect();
            } catch (e) {
                appLog(`[LyriaManager Remove] Error disconnecting Lyria service outputNode for '${instanceId}': ${(e as Error).message}`, true);
            }
            managedLyriaServiceInstancesRef.current.delete(instanceId);
            appLog(`[LyriaManager Remove] Lyria Service for instance '${instanceId}' disposed and removed.`, true);
            onStateChangeForReRender();
        }
    }, [masterGainNode, appLog, onStateChangeForReRender]);

    const getLyriaServiceInstance = useCallback((instanceId: string): LiveMusicService | null => {
        return managedLyriaServiceInstancesRef.current.get(instanceId)?.service || null;
    }, []);

    const updateLyriaServiceState = useCallback((
        instanceId: string,
        blockInternalState: Record<string, any>,
        blockParams: Record<string, any>,
        blockInputs: Record<string, any>,
        clearRequestsFn: () => void
    ) => {
        const service = getLyriaServiceInstance(instanceId);
        if (!service || !audioContext) return; // audioContext check remains relevant for service operations

        if (blockInternalState.reconnectRequest) service.reconnect();
        else if (blockInternalState.stopRequest) {
            service.stop();
            if (blockInternalState.playRequest) service.play(blockInternalState.lastEffectivePrompts);
        } else if (blockInternalState.playRequest) service.play(blockInternalState.lastEffectivePrompts);
        else if (blockInternalState.pauseRequest) service.pause();

        if (service.isConnected() || service.getPlaybackState() === 'paused') {
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
            if (blockInternalState.trackMuteUpdateNeeded) service.setMusicGenerationConfig({ muteBass: !!blockInternalState.lastMuteBass, muteDrums: !!blockInternalState.lastMuteDrums, onlyBassAndDrums: !!blockInternalState.lastOnlyBassDrums });
        }
        clearRequestsFn();
        onStateChangeForReRender(); // Ensure UI updates based on state changes
    }, [audioContext, getLyriaServiceInstance, onStateChangeForReRender]);

    const removeAllManagedLyriaServices = useCallback(() => {
        managedLyriaServiceInstancesRef.current.forEach((_, instanceId) => {
            removeLyriaServiceForInstance(instanceId);
        });
        appLog("[LyriaManager] All managed Lyria services removed.", true);
    }, [removeLyriaServiceForInstance, appLog]);

    return {
        setupLyriaServiceForInstance,
        removeLyriaServiceForInstance,
        getLyriaServiceInstance,
        updateLyriaServiceState,
        removeAllManagedLyriaServices,
        managedLyriaServiceInstancesRef,
    };
};
