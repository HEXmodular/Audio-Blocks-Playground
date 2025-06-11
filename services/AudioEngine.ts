/**
 * This class serves as the central audio processing and management engine for the application.
 * It orchestrates various audio services, including context management (`AudioContextService`) and device handling (`AudioDeviceService`).
 * The AudioEngine integrates specialized managers for different audio node types: `AudioWorkletManager` for custom AudioWorklet-based nodes, `NativeNodeManager` for standard Web Audio API nodes, and `LyriaServiceManager` for proprietary Lyria audio services.
 * It is responsible for initializing the audio system, managing the global audio state (e.g., enabling/disabling audio), updating audio graph connections based on application logic, and providing a unified interface for controlling and interacting with all managed audio components.
 * This engine acts as the primary interface for the application to interact with the Web Audio API and custom audio extensions.
 */
import {
    BlockDefinition,
    Connection,
    BlockInstance,
    AudioContextState,
    // ActiveWebAudioConnection, // Internal to AudioGraphConnectorService
    BlockParameter, // Added for updateManagedNativeNodeParams signature
} from '../types';
import { AudioContextService, InitAudioResult as ServiceInitAudioResult } from '../services/AudioContextService';
import { AudioDeviceService } from '../services/AudioDeviceService';
import { AudioGraphConnectorService } from '../services/AudioGraphConnectorService';

// Import new manager classes
import { AudioWorkletManager, IAudioWorkletManager, ManagedWorkletNodeInfo } from './AudioWorkletManager'; // Assuming IAudioWorkletManager and ManagedWorkletNodeInfo are exported
import { NativeNodeManager, INativeNodeManager, ManagedNativeNodeInfo } from './NativeNodeManager'; // Assuming INativeNodeManager and ManagedNativeNodeInfo are exported
import { LyriaServiceManager, ILyriaServiceManager, ManagedLyriaServiceInfo } from './LyriaServiceManager'; // Assuming ILyriaServiceManager and ManagedLyriaServiceInfo are exported

export interface InitAudioResult extends ServiceInitAudioResult { }

// This type is defined in the original file, keeping it here.
export interface OscillatorWorkletParams {
    frequency: number;
    gain: number;
    waveform: 'sine' | 'square' | 'sawtooth' | 'triangle';
}

export interface IAudioEngine {
    audioContext: AudioContext | null;
    masterGainNode: GainNode | null;
    isAudioGloballyEnabled: boolean;
    audioInitializationError: string | null;
    availableOutputDevices: MediaDeviceInfo[];
    selectedSinkId: string;

    audioWorkletManager: IAudioWorkletManager; // Use interface type
    nativeNodeManager: INativeNodeManager;   // Use interface type
    lyriaServiceManager: ILyriaServiceManager; // Use interface type

    toggleGlobalAudio: () => Promise<boolean>;
    initializeBasicAudioContext: (logActivity?: boolean) => Promise<InitAudioResult>;
    getSampleRate: () => number | null;
    getAudioContextState: () => AudioContextState | null;
    setOutputDevice: (sinkId: string) => Promise<boolean>;
    listOutputDevices: () => Promise<void>;

    removeAllManagedNodes: () => void;
    updateAudioGraphConnections: (
        connections: Connection[],
        blockInstances: BlockInstance[],
        getDefinitionForBlock: (instance: BlockInstance) => BlockDefinition | undefined
    ) => void;

    // Methods from managers are accessed via manager instances.
    // The original AudioEngine interface exposed some directly, which was redundant if managers are public.
    // If direct exposure is desired, they can be added as pass-through methods.
    // For now, assuming access via audioWorkletManager.methodName(), etc.
    // This means methods like sendManagedAudioWorkletNodeMessage, triggerNativeNodeEnvelope, etc.
    // are not directly on IAudioEngine but on IAudioWorkletManager etc.
    // However, the original hook *did* expose them directly. Let's stick to that for direct refactoring.

    sendManagedAudioWorkletNodeMessage: (instanceId: string, message: any) => void;
    triggerNativeNodeEnvelope: (instanceId: string, attackTime: number, decayTime: number, peakLevel: number) => void;
    triggerNativeNodeAttackHold: (instanceId: string, attackTime: number, sustainLevel: number) => void;
    triggerNativeNodeRelease: (instanceId: string, releaseTime: number) => void;
    updateManagedNativeNodeParams: (instanceId: string, parameters: BlockParameter[], currentInputs?: Record<string, any>, globalBpm?: number) => void;
    setupLyriaServiceForInstance: ILyriaServiceManager['setupLyriaServiceForInstance']; // Use interface method signature
    removeLyriaServiceForInstance: ILyriaServiceManager['removeLyriaServiceForInstance'];
    setupManagedAudioWorkletNode: IAudioWorkletManager['setupManagedAudioWorkletNode'];
    removeManagedAudioWorkletNode: IAudioWorkletManager['removeManagedAudioWorkletNode'];
    setupManagedNativeNode: INativeNodeManager['setupManagedNativeNode'];
    removeManagedNativeNode: INativeNodeManager['removeManagedNativeNode'];
}

export class AudioEngine implements IAudioEngine {
    // --- Public properties corresponding to useState from the hook ---
    public audioContext: AudioContext | null = null;
    public masterGainNode: GainNode | null = null;
    public isAudioGloballyEnabled: boolean = false;
    public audioInitializationError: string | null = null;
    public availableOutputDevices: MediaDeviceInfo[] = [];
    public selectedSinkId: string = 'default';

    // --- Manager Instances ---
    public audioWorkletManager: IAudioWorkletManager;
    public nativeNodeManager: INativeNodeManager;
    public lyriaServiceManager: ILyriaServiceManager;

    // --- Service Instances (private) ---
    private audioContextService: AudioContextService;
    private audioDeviceService: AudioDeviceService;
    private audioGraphConnectorService: AudioGraphConnectorService;

    // --- Callback for parent component re-render ---
    private readonly onStateChangeForReRender: () => void;

    constructor(onStateChangeForReRender: () => void) {
        this.onStateChangeForReRender = onStateChangeForReRender;

        // Initialize services
        this.audioContextService = new AudioContextService(this.handleContextStateChange.bind(this));
        this.audioDeviceService = new AudioDeviceService(this.handleDeviceListChanged.bind(this), this.handleSelectedSinkIdChanged.bind(this));
        this.audioGraphConnectorService = new AudioGraphConnectorService();

        // Initialize managers - managers need a way to get currentAudioContext and masterGainNode.
        // This could be passed in and updated, or they could have a getter function.
        // For now, passing the initial null values and they will need to react to updates.
        // The original hook passed currentAudioContext directly, which means managers were re-created or re-configured on context change.
        // Here, we instantiate them once. We'll need a mechanism to update their internal context if it changes.
        // This is a key difference. For now, let's assume managers can handle a null context initially
        // and then get updated via a dedicated method or by re-fetching from AudioEngine.
        // Let's make the managers take a reference to the AudioEngine or getters for now.
        // This is simpler than trying to re-initialize managers.

        this.audioWorkletManager = new AudioWorkletManager(
            this.audioContext, // This will be null initially
            this.onStateChangeForReRender // Manager uses this to trigger engine's host re-render
        );
        this.nativeNodeManager = new NativeNodeManager(
            this.audioContext, // This will be null initially
            this.onStateChangeForReRender,
        );
        this.lyriaServiceManager = new LyriaServiceManager(
            this.audioContext, // null initially
            this.masterGainNode, // null initially
            this.onStateChangeForReRender,
        );

        // Initial setup corresponding to useEffects in the hook
        this.audioDeviceService.startDeviceChangeListener();
        this.listOutputDevices(); // Initial list
    }

    // --- Private methods for service callbacks ---
    private handleContextStateChange(newState: AudioContextState): void {
        console.log(`[AudioEngine] AudioContext state change: ${newState}`);
        const newContext = this.audioContextService.getAudioContext();
        const newMasterGain = this.audioContextService.getMasterGainNode();

        this.audioContext = newContext;
        this.masterGainNode = newMasterGain;

        // Update managers with new context/gain node
        // This requires managers to have a method to update their context
        (this.audioWorkletManager as AudioWorkletManager)._setAudioContext(newContext); // Assuming an internal setter or a public update method
        (this.nativeNodeManager as NativeNodeManager)._setAudioContext(newContext); // Assuming an internal setter
        (this.lyriaServiceManager as LyriaServiceManager)._setAudioContextAndMasterGain(newContext, newMasterGain); // Assuming an internal setter


        if (newState === 'closed' || newState === 'suspended') {
            if (this.isAudioGloballyEnabled) {
                this.isAudioGloballyEnabled = false;
            }
        }
        this.updateDeviceServiceNodes(); // Corresponds to useEffect for audioDeviceService.setAudioNodes
        this.handleGraphConnectorState(); // Corresponds to useEffect for audioGraphConnectorService.disconnectAll
        this.onStateChangeForReRender();
    }

    private handleDeviceListChanged(devices: MediaDeviceInfo[]): void {
        this.availableOutputDevices = devices;
        this.onStateChangeForReRender();
    }

    private handleSelectedSinkIdChanged(sinkId: string): void {
        this.selectedSinkId = sinkId;
        this.onStateChangeForReRender();
    }

    // --- Methods to replicate useEffect dependencies ---
    private updateDeviceServiceNodes(): void {
        this.audioDeviceService.setAudioNodes(this.audioContext, this.masterGainNode);
    }

    private handleGraphConnectorState(): void {
        if (!this.isAudioGloballyEnabled || !this.audioContext || this.audioContext.state !== 'running') {
            this.audioGraphConnectorService.disconnectAll();
        }
    }

    // --- Public methods (to be implemented) ---

    public async initializeBasicAudioContext(logActivity: boolean = true): Promise<InitAudioResult> {
        const result = await this.audioContextService.initialize(false); // `initialize` now part of service

        // The handleContextStateChange callback will update this.audioContext and this.masterGainNode,
        // and also call _setAudioContext on managers.
        // So, direct setting here might be redundant if handleContextStateChange is comprehensive.
        // However, the original hook did explicit setCurrentAudioContext, etc.
        // Let's ensure state is updated immediately from the result.
        this.audioContext = result.context; // Directly update from result
        this.masterGainNode = this.audioContextService.getMasterGainNode(); // Get it after init

        // Update managers explicitly after context is set from result
        (this.audioWorkletManager as AudioWorkletManager)._setAudioContext(this.audioContext);
        (this.nativeNodeManager as NativeNodeManager)._setAudioContext(this.audioContext);
        (this.lyriaServiceManager as LyriaServiceManager)._setAudioContextAndMasterGain(this.audioContext, this.masterGainNode);

        if (!result.context) {
            this.audioInitializationError = this.audioInitializationError || "AudioContext initialization failed in service.";
        } else {
            this.audioInitializationError = null; // Clear previous errors
            if (result.context.state === 'running') {
                const workletsReady = await this.audioWorkletManager.checkAndRegisterPredefinedWorklets(logActivity);
                this.audioWorkletManager.setIsAudioWorkletSystemReady(workletsReady);
            } else {
                this.audioWorkletManager.setIsAudioWorkletSystemReady(false);
            }
            await this.audioDeviceService.listOutputDevices(); // List devices after context is up
        }
        this.updateDeviceServiceNodes(); // Ensure device service is aware of new nodes
        this.onStateChangeForReRender();
        return result;
    }

    public async toggleGlobalAudio(): Promise<boolean> {
        this.audioInitializationError = null; // Clear previous errors at the start of a toggle attempt

        if (this.isAudioGloballyEnabled) {
            // If currently enabled, we want to disable (suspend)
            await this.audioContextService.suspendContext();
            this.isAudioGloballyEnabled = false; // Update internal state
            console.log(`[AudioEngine Toggle] Audio globally DISABLED. Context state: ${this.audioContextService.getContextState()}`);
        } else {
            // If currently disabled, we want to enable
            let serviceContext = this.audioContextService.getAudioContext();
            if (!serviceContext || serviceContext.state === 'closed') {
                const initResult = await this.audioContextService.initialize(true); // Attempt to create/resume
                // The handleContextStateChange callback should update this.audioContext and this.masterGainNode
                // and also call _setAudioContext on managers.
                serviceContext = this.audioContextService.getAudioContext(); // refresh our local copy

                if (!serviceContext) {
                    this.isAudioGloballyEnabled = false;
                    this.audioInitializationError = this.audioInitializationError || "AudioContext creation/retrieval failed in toggleGlobalAudio.";
                    this.onStateChangeForReRender();
                    return false;
                }
            }

            if (serviceContext.state === 'suspended') {
                await this.audioContextService.resumeContext();
            }

            // Re-check state after attempting to resume/initialize
            const currentServiceContextState = this.audioContextService.getContextState();
            if (currentServiceContextState === 'running') {
                this.isAudioGloballyEnabled = true;
                console.log(`[AudioEngine Toggle] Audio globally ENABLED. Context state: ${currentServiceContextState}`);

                // Ensure managers have the latest context, especially if it was just initialized
                // The handleContextStateChange should have run, but an explicit update ensures consistency
                (this.audioWorkletManager as AudioWorkletManager)._setAudioContext(this.audioContext);
                (this.nativeNodeManager as NativeNodeManager)._setAudioContext(this.audioContext);
                (this.lyriaServiceManager as LyriaServiceManager)._setAudioContextAndMasterGain(this.audioContext, this.masterGainNode);

                const workletsReady = await this.audioWorkletManager.checkAndRegisterPredefinedWorklets(true);
                this.audioWorkletManager.setIsAudioWorkletSystemReady(workletsReady);
            } else {
                this.isAudioGloballyEnabled = false;
                const errMsg = `Failed to enable audio. Context state: ${currentServiceContextState}.`;
                this.audioInitializationError = this.audioInitializationError || errMsg;
                this.onStateChangeForReRender();
                return false;
            }
        }
        this.handleGraphConnectorState(); // Update graph based on new isAudioGloballyEnabled state
        this.onStateChangeForReRender();
        return true; // Return true if toggle operation itself didn't hit an immediate snag
    }

    public getSampleRate(): number | null {
        return this.audioContextService.getSampleRate();
    }

    public getAudioContextState(): AudioContextState | null {
        return this.audioContextService.getContextState();
    }

    public async setOutputDevice(sinkId: string): Promise<boolean> {
        const success = await this.audioDeviceService.setOutputDevice(sinkId);
        // The handleSelectedSinkIdChanged callback will update this.selectedSinkId and call onStateChangeForReRender.
        return success;
    }

    public async listOutputDevices(): Promise<void> {
        await this.audioDeviceService.listOutputDevices();
        // setAvailableOutputDevices and setSelectedSinkId are handled by callbacks
    }

    public removeAllManagedNodes(): void {
        this.audioWorkletManager.removeAllManagedWorkletNodes();
        this.nativeNodeManager.removeAllManagedNativeNodes();
        this.lyriaServiceManager.removeAllManagedLyriaServices();
        console.log("[AudioEngine] All managed nodes removal signaled by AudioEngine.");
        // The individual removeAll... methods in managers should call onStateChangeForReRender if they modify state that requires it.
        // If AudioEngine itself needs to signal a global re-render after all are done, it can do so here.
        // The original hook had onStateChangeForReRender in its dependency array for its version of this function.
        this.onStateChangeForReRender();
    }

    public updateAudioGraphConnections(
        connections: Connection[],
        blockInstances: BlockInstance[],
        getDefinitionForBlock: (instance: BlockInstance) => BlockDefinition | undefined
    ): void {
        this.audioGraphConnectorService.updateConnections(
            this.audioContext,
            this.isAudioGloballyEnabled,
            connections,
            blockInstances,
            getDefinitionForBlock,
            (this.audioWorkletManager as AudioWorkletManager).getManagedNodesMap(),
            (this.nativeNodeManager as NativeNodeManager).getManagedNodesMap(),
            (this.lyriaServiceManager as LyriaServiceManager).getManagedInstancesMap()
        );
        // No direct onStateChangeForReRender here, as graph updates don't usually change AudioEngine's own state.
        // If specific node setups within managers trigger re-renders, they handle it.
    }

    // Direct passthrough methods for manager functionalities as per original interface
    public sendManagedAudioWorkletNodeMessage(instanceId: string, message: any): void {
        this.audioWorkletManager.sendManagedAudioWorkletNodeMessage(instanceId, message);
    }
    public triggerNativeNodeEnvelope(instanceId: string, attackTime: number, decayTime: number, peakLevel: number): void {
        this.nativeNodeManager.triggerNativeNodeEnvelope(instanceId, attackTime, decayTime, peakLevel);
    }
    public triggerNativeNodeAttackHold(instanceId: string, attackTime: number, sustainLevel: number): void {
        this.nativeNodeManager.triggerNativeNodeAttackHold(instanceId, attackTime, sustainLevel);
    }
    public triggerNativeNodeRelease(instanceId: string, releaseTime: number): void {
        this.nativeNodeManager.triggerNativeNodeRelease(instanceId, releaseTime);
    }
    public updateManagedNativeNodeParams(instanceId: string, parameters: BlockParameter[], currentInputs?: Record<string, any>, globalBpm?: number): void {
        this.nativeNodeManager.updateManagedNativeNodeParams(instanceId, parameters, currentInputs, globalBpm);
    }
    public async setupLyriaServiceForInstance(instanceId: string, definition: BlockDefinition, addBlockLog: (message: string) => void): Promise<boolean> {
        return this.lyriaServiceManager.setupLyriaServiceForInstance(instanceId, definition, addBlockLog);
    }
    public removeLyriaServiceForInstance(instanceId: string): void {
        this.lyriaServiceManager.removeLyriaServiceForInstance(instanceId);
    }
    public async setupManagedAudioWorkletNode(instanceId: string, definition: BlockDefinition, initialParams: BlockParameter[]): Promise<boolean> {
        return this.audioWorkletManager.setupManagedAudioWorkletNode(instanceId, definition, initialParams);
    }
    public removeManagedAudioWorkletNode(instanceId: string): void {
        this.audioWorkletManager.removeManagedAudioWorkletNode(instanceId);
    }
    public async setupManagedNativeNode(instanceId: string, definition: BlockDefinition, initialParams: BlockParameter[], currentBpm?: number): Promise<boolean> {
        return this.nativeNodeManager.setupManagedNativeNode(instanceId, definition, initialParams, currentBpm);
    }
    public removeManagedNativeNode(instanceId: string): void {
        this.nativeNodeManager.removeManagedNativeNode(instanceId);
    }

    public dispose(): void {
        console.log("[AudioEngine] Disposing. Cleaning up all services and managers.");
        this.audioGraphConnectorService.disconnectAll();

        // Call removeAll on managers if context is valid, similar to hook logic
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioWorkletManager.removeAllManagedWorkletNodes();
            this.nativeNodeManager.removeAllManagedNativeNodes();
            this.lyriaServiceManager.removeAllManagedLyriaServices();
        }

        this.audioContextService.cleanupContext(); // This will close the context
        this.audioDeviceService.stopDeviceChangeListener(); // From useEffect cleanup
        this.audioDeviceService.cleanup();

        // Potentially call dispose on managers if they have such methods
        // (this was not explicitly part of the hook's direct cleanup for managers, but good practice)
        // if ((this.audioWorkletManager as AudioWorkletManager).dispose) { (this.audioWorkletManager as AudioWorkletManager).dispose(); }
        // etc. for other managers
    }
}
