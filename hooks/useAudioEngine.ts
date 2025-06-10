import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    BlockDefinition,
    Connection,
    BlockInstance,
    AudioContextState,
    // Types that might be needed from other services if they were exposed, e.g. ActiveWebAudioConnection
} from '../types';
import { AudioContextService, InitAudioResult as ServiceInitAudioResult } from '../services/AudioContextService';
import { AudioDeviceService } from '../services/AudioDeviceService';
import { AudioGraphConnectorService } // Removed ActiveWebAudioConnection as it's internal to service
    from '../services/AudioGraphConnectorService';
import { useAudioWorkletManager, AudioWorkletManager } from './useAudioWorkletManager';
import { useNativeNodeManager, NativeNodeManager } from './useNativeNodeManager';
import { useLyriaServiceManager, LyriaServiceManager } from './useLyriaServiceManager';
// Constants might still be needed if used directly in this hook
// For now, assuming they are mostly used by sub-managers or App.tsx

export interface InitAudioResult extends ServiceInitAudioResult {}

export interface AudioEngine {
    audioContext: AudioContext | null;
    masterGainNode: GainNode | null;
    isAudioGloballyEnabled: boolean;
    audioInitializationError: string | null;
    availableOutputDevices: MediaDeviceInfo[];
    selectedSinkId: string;

    audioWorkletManager: AudioWorkletManager;
    nativeNodeManager: NativeNodeManager;
    lyriaServiceManager: LyriaServiceManager;
    // Services are now internal, not part of the public AudioEngine interface
    // audioContextService: AudioContextService;
    // audioDeviceService: AudioDeviceService;

    toggleGlobalAudio: () => Promise<boolean>;
    initializeBasicAudioContext: (logActivity?: boolean) => Promise<InitAudioResult>;
    getSampleRate: () => number | null;
    getAudioContextState: () => AudioContextState | null;
    setOutputDevice: (sinkId: string) => Promise<boolean>;
    listOutputDevices: () => Promise<void>; // For explicit refresh

    removeAllManagedNodes: () => void;
    updateAudioGraphConnections: (
        connections: Connection[],
        blockInstances: BlockInstance[],
        getDefinitionForBlock: (instance: BlockInstance) => BlockDefinition | undefined
    ) => void;

    // Methods previously on specific managers, now potentially exposed directly or handled internally
    // e.g. methods from audioWorkletManager, nativeNodeManager etc. are accessed via their instances.
    // sendManagedAudioWorkletNodeMessage might be specific to worklet manager instance.
    sendManagedAudioWorkletNodeMessage: (instanceId: string, message: any) => void;
    // triggerNativeNodeEnvelope, triggerNativeNodeAttackHold, triggerNativeNodeRelease are specific to nativeNodeManager instance.
    triggerNativeNodeEnvelope: (instanceId: string, attackTime: number, decayTime: number, peakLevel: number) => void;
    triggerNativeNodeAttackHold: (instanceId: string, attackTime: number, sustainLevel: number) => void;
    triggerNativeNodeRelease: (instanceId: string, releaseTime: number) => void;
    updateManagedNativeNodeParams: (instanceId: string, parameters: BlockInstance['parameters'], currentInputs?: Record<string, any>, globalBpm?: number) => void;
    setupLyriaServiceForInstance: LyriaServiceManager['setupLyriaServiceForInstance'];
    removeLyriaServiceForInstance: LyriaServiceManager['removeLyriaServiceForInstance'];
    setupManagedAudioWorkletNode: AudioWorkletManager['setupManagedAudioWorkletNode'];
    removeManagedAudioWorkletNode: AudioWorkletManager['removeManagedAudioWorkletNode'];
    setupManagedNativeNode: NativeNodeManager['setupManagedNativeNode'];
    removeManagedNativeNode: NativeNodeManager['removeManagedNativeNode'];

}

export const useAudioEngine = (
    onStateChangeForReRender: () => void
): AudioEngine => {
    // --- State previously in useAudioContextManager ---
    const [currentAudioContext, setCurrentAudioContext] = useState<AudioContext | null>(null);
    const [currentMasterGainNode, setCurrentMasterGainNode] = useState<GainNode | null>(null);
    const [isAudioGloballyEnabled, setIsAudioGloballyEnabled] = useState(false);
    const [audioInitializationError, setAudioInitializationError] = useState<string | null>(null);

    // --- State previously in useAudioDeviceManager ---
    const [availableOutputDevices, setAvailableOutputDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedSinkId, setSelectedSinkId] = useState<string>('default');

    // --- Callbacks for services ---
    const handleContextStateChange = useCallback((newState: AudioContextState) => {
        console.log(`[useAudioEngine] AudioContext state change: ${newState}`);
        setCurrentAudioContext(audioContextService.getAudioContext()); // Update with current from service
        setCurrentMasterGainNode(audioContextService.getMasterGainNode()); // Update with current from service
        if (newState === 'closed' || newState === 'suspended') {
            if (isAudioGloballyEnabled) {
                setIsAudioGloballyEnabled(false);
            }
        }
        onStateChangeForReRender();
    }, [onStateChangeForReRender, isAudioGloballyEnabled]); // audioContextService is stable via useMemo

    const handleDeviceListChanged = useCallback((devices: MediaDeviceInfo[]) => {
        setAvailableOutputDevices(devices);
        onStateChangeForReRender();
    }, [onStateChangeForReRender]);

    const handleSelectedSinkIdChanged = useCallback((sinkId: string) => {
        setSelectedSinkId(sinkId);
        onStateChangeForReRender();
    }, [onStateChangeForReRender]);

    // --- Service Instantiations ---
    const audioContextService = useMemo(() => new AudioContextService(handleContextStateChange), [handleContextStateChange]);
    const audioDeviceService = useMemo(() => new AudioDeviceService(handleDeviceListChanged, handleSelectedSinkIdChanged), [handleDeviceListChanged, handleSelectedSinkIdChanged]);
    const audioGraphConnectorService = useMemo(() => new AudioGraphConnectorService(), []);


    // --- Sub-Hook Instantiations (Worklet, Native, Lyria) ---
    // These now use the local state for audioContext and masterGainNode
    const audioWorkletManager = useAudioWorkletManager({
        onStateChangeForReRender,
        audioContext: currentAudioContext,
    });

    const nativeNodeManager = useNativeNodeManager({
        onStateChangeForReRender,
        audioContext: currentAudioContext,
    });

    const lyriaServiceManager = useLyriaServiceManager({
        onStateChangeForReRender,
        audioContext: currentAudioContext,
        masterGainNode: currentMasterGainNode,
    });

    // Destructure methods from sub-managers for easier use
    const {
        checkAndRegisterPredefinedWorklets,
        setIsAudioWorkletSystemReady,
        removeAllManagedWorkletNodes,
        setupManagedAudioWorkletNode,       // Exposed
        removeManagedAudioWorkletNode,      // Exposed
        sendManagedAudioWorkletNodeMessage, // Exposed
        isAudioWorkletSystemReady,          // Needed for init
    } = audioWorkletManager;

    const {
        removeAllManagedNativeNodes,
        setupManagedNativeNode,         // Exposed
        removeManagedNativeNode,        // Exposed
        triggerNativeNodeEnvelope,      // Exposed
        triggerNativeNodeAttackHold,    // Exposed
        triggerNativeNodeRelease,       // Exposed
        updateManagedNativeNodeParams,  // Exposed
    } = nativeNodeManager;

    const {
        removeAllManagedLyriaServices,
        setupLyriaServiceForInstance,   // Exposed
        removeLyriaServiceForInstance,  // Exposed
    } = lyriaServiceManager;


    // --- Core Audio Engine Logic ---
    const initializeBasicAudioContext = useCallback(async (logActivity: boolean = true): Promise<InitAudioResult> => {
        // logActivity is not used by service anymore, console logs are direct
        const result = await audioContextService.initialize(false);
        setCurrentAudioContext(result.context);
        setCurrentMasterGainNode(audioContextService.getMasterGainNode()); // Get it after init
        if (!result.context) {
            setAudioInitializationError(audioInitializationError || "AudioContext initialization failed in service.");
        } else {
            setAudioInitializationError(null);
            if (result.context.state === 'running') {
                const workletsReady = await checkAndRegisterPredefinedWorklets(logActivity); // logActivity here is for worklet registration logging
                setIsAudioWorkletSystemReady(workletsReady);
            } else {
                setIsAudioWorkletSystemReady(false);
            }
            await audioDeviceService.listOutputDevices(); // List devices after context is up
        }
        return result;
    }, [audioContextService, audioDeviceService, checkAndRegisterPredefinedWorklets, setIsAudioWorkletSystemReady, audioInitializationError]);

    const toggleGlobalAudio = useCallback(async (): Promise<boolean> => {
        setAudioInitializationError(null);
        let serviceContext = audioContextService.getAudioContext();

        if (isAudioGloballyEnabled) {
            await audioContextService.suspendContext();
            setIsAudioGloballyEnabled(false);
            console.log(`[useAudioEngine Toggle] Audio globally DISABLED. Context state: ${audioContextService.getContextState()}`);
        } else {
            if (!serviceContext || serviceContext.state === 'closed') {
                const initResult = await audioContextService.initialize(true); // Attempt to resume/create new
                serviceContext = initResult.context;
                setCurrentAudioContext(serviceContext);
                setCurrentMasterGainNode(audioContextService.getMasterGainNode());
                if (!serviceContext) {
                    setIsAudioGloballyEnabled(false);
                    setAudioInitializationError(audioInitializationError || "AudioContext creation/retrieval failed in toggleGlobalAudio.");
                    return false;
                }
            }
            if (serviceContext.state === 'suspended') {
                await audioContextService.resumeContext();
            }
            if (audioContextService.getContextState() === 'running') {
                setIsAudioGloballyEnabled(true);
                console.log(`[useAudioEngine Toggle] Audio globally ENABLED. Context state: ${audioContextService.getContextState()}`);
                // Setup worklets after audio is enabled
                const workletsReady = await checkAndRegisterPredefinedWorklets(true);
                setIsAudioWorkletSystemReady(workletsReady);
            } else {
                setIsAudioGloballyEnabled(false);
                const errMsg = `Failed to enable audio. Context state: ${audioContextService.getContextState()}.`;
                setAudioInitializationError(audioInitializationError || errMsg);
                return false;
            }
        }
        return true; // Return based on successful toggle, not isAudioGloballyEnabled state directly as it might be async
    }, [isAudioGloballyEnabled, audioContextService, checkAndRegisterPredefinedWorklets, setIsAudioWorkletSystemReady, audioInitializationError]);

    const getSampleRate = useCallback((): number | null => {
        return audioContextService.getSampleRate();
    }, [audioContextService]);

    const getAudioContextState = useCallback((): AudioContextState | null => {
        return audioContextService.getContextState();
    }, [audioContextService]);

    const setOutputDevice = useCallback(async (sinkId: string): Promise<boolean> => {
        return audioDeviceService.setOutputDevice(sinkId);
    }, [audioDeviceService]);

    const listOutputDevices = useCallback(async (): Promise<void> => {
        await audioDeviceService.listOutputDevices();
    }, [audioDeviceService]);

    const removeAllManagedNodes = useCallback(() => {
        removeAllManagedWorkletNodes();
        removeAllManagedNativeNodes();
        removeAllManagedLyriaServices();
        console.log("[useAudioEngine] All managed nodes removal signaled.");
        onStateChangeForReRender(); // If this is still needed for App.tsx
    }, [removeAllManagedWorkletNodes, removeAllManagedNativeNodes, removeAllManagedLyriaServices, onStateChangeForReRender]);

    const updateAudioGraphConnections = useCallback((
        connections: Connection[],
        blockInstances: BlockInstance[],
        getDefinitionForBlock: (instance: BlockInstance) => BlockDefinition | undefined
    ) => {
        audioGraphConnectorService.updateConnections(
            currentAudioContext,
            isAudioGloballyEnabled,
            connections,
            blockInstances,
            getDefinitionForBlock,
            audioWorkletManager.managedWorkletNodesRef.current, // Access ref directly
            nativeNodeManager.managedNativeNodesRef.current,   // Access ref directly
            lyriaServiceManager.managedLyriaServiceInstancesRef.current // Access ref directly
        );
    }, [audioGraphConnectorService, currentAudioContext, isAudioGloballyEnabled, audioWorkletManager, nativeNodeManager, lyriaServiceManager]);

    // --- Lifecycle Effects ---
    useEffect(() => {
        // Update AudioDeviceService with current context and gain node
        audioDeviceService.setAudioNodes(currentAudioContext, currentMasterGainNode);
    }, [currentAudioContext, currentMasterGainNode, audioDeviceService]);

    useEffect(() => {
        // Manage device change listener
        audioDeviceService.startDeviceChangeListener();
        audioDeviceService.listOutputDevices(); // Initial list
        return () => {
            audioDeviceService.stopDeviceChangeListener();
        };
    }, [audioDeviceService]);

    useEffect(() => {
        // Graph connector cleanup
        if (!isAudioGloballyEnabled || !currentAudioContext || currentAudioContext.state !== 'running') {
            audioGraphConnectorService.disconnectAll();
        }
        // No explicit return cleanup for disconnectAll here as it's managed by the condition above
        // and a final cleanup on unmount.
    }, [isAudioGloballyEnabled, currentAudioContext, audioGraphConnectorService]);


    useEffect(() => {
        // Global cleanup for all services and managers on unmount
        return () => {
            console.log("[useAudioEngine] Unmounting. Cleaning up all services and managers.");
            audioGraphConnectorService.disconnectAll();
            if (currentAudioContext && currentAudioContext.state !== 'closed') {
                removeAllManagedWorkletNodes();
                removeAllManagedNativeNodes();
                removeAllManagedLyriaServices();
            }
            audioContextService.cleanupContext(); // This will close the context
            audioDeviceService.cleanup(); // Cleanup device listeners etc.
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [audioContextService, audioDeviceService, audioGraphConnectorService, removeAllManagedWorkletNodes, removeAllManagedNativeNodes, removeAllManagedLyriaServices]);
    // currentAudioContext is intentionally omitted from deps here to avoid re-running on its changes,
    // as cleanup should happen with the context instance that was active.

    return useMemo(() => ({
        audioContext: currentAudioContext,
        masterGainNode: currentMasterGainNode,
        isAudioGloballyEnabled,
        audioInitializationError,
        availableOutputDevices,
        selectedSinkId,

        audioWorkletManager, // Expose manager instances
        nativeNodeManager,
        lyriaServiceManager,

        initializeBasicAudioContext,
        toggleGlobalAudio,
        getSampleRate,
        getAudioContextState,
        setOutputDevice,
        listOutputDevices,

        removeAllManagedNodes,
        updateAudioGraphConnections,

        // Expose specific methods from managers
        sendManagedAudioWorkletNodeMessage,
        triggerNativeNodeEnvelope,
        triggerNativeNodeAttackHold,
        triggerNativeNodeRelease,
        updateManagedNativeNodeParams,
        setupLyriaServiceForInstance,
        removeLyriaServiceForInstance,
        setupManagedAudioWorkletNode,
        removeManagedAudioWorkletNode,
        setupManagedNativeNode,
        removeManagedNativeNode,
    }), [
        currentAudioContext, currentMasterGainNode, isAudioGloballyEnabled, audioInitializationError,
        availableOutputDevices, selectedSinkId, audioWorkletManager, nativeNodeManager, lyriaServiceManager,
        initializeBasicAudioContext, toggleGlobalAudio, getSampleRate, getAudioContextState,
        setOutputDevice, listOutputDevices, removeAllManagedNodes, updateAudioGraphConnections,
        sendManagedAudioWorkletNodeMessage, triggerNativeNodeEnvelope, triggerNativeNodeAttackHold,
        triggerNativeNodeRelease, updateManagedNativeNodeParams, setupLyriaServiceForInstance,
        removeLyriaServiceForInstance, setupManagedAudioWorkletNode, removeManagedAudioWorkletNode,
        setupManagedNativeNode, removeManagedNativeNode
    ]);
};

// Helper types that might have been in other files, ensure they are defined or imported
// export type AudioContextState = 'suspended' | 'running' | 'closed' | 'interrupted';
// (If not already in types.ts)
// ActiveWebAudioConnection is internal to AudioGraphConnectorService now.
// ManagedWorkletNodeInfo, ManagedNativeNodeInfo, ManagedLyriaServiceInfo are imported/used by sub-hooks which are still used.
// OscillatorWorkletParams might be defined here if it's a general type, or within useAudioWorkletManager if specific.
export interface OscillatorWorkletParams {
  frequency: number;
  gain: number;
  waveform: 'sine' | 'square' | 'sawtooth' | 'triangle';
}

// Ensure all other necessary types (BlockDefinition, Connection, etc.) are imported from '../types'.
// Constants like OSCILLATOR_BLOCK_DEFINITION etc. are assumed to be handled by App.tsx or specific managers.
// If useAudioEngine itself needs these constants, they should be imported here.
// For now, the structure assumes these are passed down or utilized by the sub-managers.
// The sub-managers (useAudioWorkletManager, etc.) still exist and manage their specific nodes/services.
// This refactoring consolidates the context, device, and graph connection logic.
