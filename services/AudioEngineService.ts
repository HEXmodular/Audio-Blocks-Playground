/**
 * This service acts as a comprehensive manager for the application's audio capabilities, providing a centralized interface.
 * It initializes and oversees the core `AudioContext` via an internal `AudioContextService` instance, managing its lifecycle and state.
 * The service integrates and coordinates specialized managers: `AudioWorkletManager` for custom audio processing nodes, `NativeNodeManager` for standard Web Audio API nodes, and `LyriaServiceManager` for Lyria-specific audio functionalities.
 * It features a subscription model, allowing different parts of the application to listen for and react to changes in audio state, such as device changes or global audio enablement.
 * Responsibilities also include managing audio output devices, handling global audio toggling, and providing a unified API for node management and interaction, often exported as a singleton for global access.
 */
import { AudioContextService } from './AudioContextService';
import { AudioWorkletManager } from './AudioWorkletManager';
import { NativeNodeManager } from './NativeNodeManager';
import { LyriaServiceManager } from './LyriaServiceManager';
import { OutputDevice, AudioEngineState, AudioNodeInfo, ManagedAudioWorkletNodeMessage, AudioWorkletNodeOptions, EnvelopeParams } from '../types';

export class AudioEngineService {
    private _audioContext: AudioContext | null = null;
    private _masterGainNode: GainNode | null = null;
    private _isAudioGloballyEnabled = false;
    private _audioInitializationError: string | null = null;
    private _availableOutputDevices: OutputDevice[] = [];
    private _selectedSinkId: string | null = null;
    private _audioContextState: AudioContextState | null = null;

    private _subscribers: (() => void)[] = [];
    private _audioContextService: AudioContextService;

    public audioWorkletManager: AudioWorkletManager;
    public nativeNodeManager: NativeNodeManager;
    public lyriaServiceManager: LyriaServiceManager;

    constructor() {
        this._audioContextService = new AudioContextService(this._notifySubscribers.bind(this));
        this.audioWorkletManager = new AudioWorkletManager(() => this._audioContext, this._notifySubscribers.bind(this));
        this.nativeNodeManager = new NativeNodeManager(() => this._audioContext, this._notifySubscribers.bind(this));
        this.lyriaServiceManager = new LyriaServiceManager(this._notifySubscribers.bind(this));

        this.initializeBasicAudioContext();
        this.listOutputDevices();
    }

    // Subscription model
    public subscribe(callback: () => void): () => void {
        this._subscribers.push(callback);
        return () => this.unsubscribe(callback); // Return an unsubscribe function
    }

    public unsubscribe(callback: () => void): void {
        this._subscribers = this._subscribers.filter(sub => sub !== callback);
    }

    private _notifySubscribers(): void {
        this._subscribers.forEach(sub => {
            try {
                sub();
            } catch (error) {
                console.error("Error in subscriber callback:", error);
            }
        });
    }

    // Getters for state properties
    get audioContext(): AudioContext | null {
        return this._audioContext;
    }

    get masterGainNode(): GainNode | null {
        return this._masterGainNode;
    }

    get isAudioGloballyEnabled(): boolean {
        return this._isAudioGloballyEnabled;
    }

    get audioInitializationError(): string | null {
        return this._audioInitializationError;
    }

    get availableOutputDevices(): OutputDevice[] {
        return this._availableOutputDevices;
    }

    get selectedSinkId(): string | null {
        return this._selectedSinkId;
    }

    get audioEngineState(): AudioEngineState {
        return {
            isAudioGloballyEnabled: this._isAudioGloballyEnabled,
            audioInitializationError: this._audioInitializationError,
            availableOutputDevices: this._availableOutputDevices,
            selectedSinkId: this._selectedSinkId,
            audioContextState: this._audioContext?.state ?? null,
            sampleRate: this.getSampleRate(),
        };
    }

public initializeBasicAudioContext = async (): Promise<void> => {
    if (this._audioContext && this._audioContext.state !== 'closed') {
        console.warn('AudioContext already initialized and not closed. Current state:', this._audioContext.state);
        // Optionally, re-check consistency or notify if state is unexpected (e.g., suspended but should be running)
        // For now, just return as it's not 'closed'.
        return;
    }

    // Reset any previous error states specific to initialization
    this._audioInitializationError = null;

    try {
        console.log("AudioEngineService: Attempting to initialize AudioContext via AudioContextService...");
        const initResult = await this._audioContextService.initialize(false); // false means don't force resume here
        this._audioContext = initResult.context;

        if (!this._audioContext || this._audioContext.state === 'closed') {
            const errorMessage = `Failed to initialize AudioContext or it's closed. State: ${this._audioContext?.state || 'null'}`;
            console.error(`AudioEngineService: ${errorMessage}`);
            this._audioInitializationError = errorMessage;
            this._isAudioGloballyEnabled = false;
            this._audioContext = null; // Ensure it's null if in this state
            throw new Error(errorMessage);
        }

        console.log(`AudioEngineService: AudioContext obtained from service. Initial state: ${this._audioContext.state}`);
        this._audioContextState = this._audioContext.state; // Set initial state

        // Setup master gain node
        if (this._masterGainNode) { // If for some reason it existed, disconnect
            try { this._masterGainNode.disconnect(); } catch(e) { /* ignore */ }
        }
        this._masterGainNode = this._audioContext.createGain();
        this._masterGainNode.connect(this._audioContext.destination);
        console.log("AudioEngineService: Master gain node created and connected.");

        // Set global enabled flag based on context state (usually 'suspended' or 'running' at this point)
        this._isAudioGloballyEnabled = this._audioContext.state === 'running';

        // Setup state change listener
        this._audioContext.onstatechange = () => {
            if (this._audioContext) {
                this._audioContextState = this._audioContext.state;
                console.log(`AudioEngineService: AudioContext state changed to ${this._audioContextState}.`);
                if (this._audioContext.state === 'closed') {
                    this._isAudioGloballyEnabled = false;
                    // Consider more robust cleanup: nullify masterGain, notify, etc.
                    console.warn("AudioEngineService: AudioContext closed. Audio is now globally disabled.");
                } else if (this._audioContext.state === 'running') {
                    // this._isAudioGloballyEnabled = true; // This is handled by toggleGlobalAudio
                } else if (this._audioContext.state === 'suspended') {
                    // this._isAudioGloballyEnabled = false; // This is handled by toggleGlobalAudio
                }
            } else {
                // This case should ideally not happen if _audioContext is managed correctly
                console.warn("AudioEngineService: onstatechange triggered but _audioContext is null.");
                this._audioContextState = null;
                this._isAudioGloballyEnabled = false;
            }
            this._notifySubscribers();
        };

        await this.listOutputDevices(); // List devices before attempting to set one

        if (this._audioContext && this._audioContext.state !== 'closed') {
            const defaultOutput = this._availableOutputDevices.find(d => d.deviceId === 'default') || this._availableOutputDevices[0];
            if (defaultOutput) {
                console.log(`AudioEngineService: Attempting to set default output device to: ${defaultOutput.label} (${defaultOutput.deviceId})`);
                await this.setOutputDevice(defaultOutput.deviceId);
            } else {
                console.log("AudioEngineService: No default output device found or available to set.");
            }
        } else {
            const message = `AudioEngineService: AudioContext became invalid (state: ${this._audioContext?.state}) before default output device could be set.`;
            console.warn(message);
            this._audioInitializationError = this._audioInitializationError || message; // Preserve earlier error if any
        }

        console.log(`AudioEngineService: AudioContext initialization process finished. Final state: ${this._audioContext?.state}, GloballyEnabled: ${this._isAudioGloballyEnabled}`);

    } catch (error) {
        const specificErrorMessage = `Error during AudioContext initialization in AudioEngineService: ${(error as Error).message}`;
        console.error(specificErrorMessage);
        this._audioInitializationError = specificErrorMessage;
        this._isAudioGloballyEnabled = false;

        if (this._masterGainNode) {
            try { this._masterGainNode.disconnect(); } catch (e) { /* ignore */ }
            this._masterGainNode = null;
        }
        // Ensure _audioContext is null if it's in a bad state or never properly initialized
        if (!this._audioContext || this._audioContext.state === 'closed') {
            this._audioContext = null;
        }
        this._audioContextState = this._audioContext?.state ?? null; // Reflect the potentially null context
    } finally {
        this._notifySubscribers(); // Notify subscribers of any state changes
    }
};

    public toggleGlobalAudio = async (): Promise<void> => {
        if (!this._audioContext) {
            await this.initializeBasicAudioContext();
            // If initialization failed, audio context might still be null
            if (!this._audioContext) return;
        }

        if (this._audioContext.state === 'suspended') {
            await this._audioContext.resume();
        } else if (this._audioContext.state === 'running') {
            await this._audioContext.suspend();
        }
        this._isAudioGloballyEnabled = this._audioContext.state === 'running';
        this._notifySubscribers();
    };

    public getSampleRate = (): number | null => {
        return this._audioContext?.sampleRate ?? null;
    };

    public getAudioContextState = (): AudioContextState | null => {
        return this._audioContext?.state ?? null;
    };

    public getAudioContextServiceInstance(): AudioContextService {
        return this._audioContextService;
    }

public setOutputDevice = async (sinkId: string): Promise<void> => {
    const oldSinkId = this._selectedSinkId; // Store old sinkId for potential revert

    // Always get the most current context from the service.
    this._audioContext = this._audioContextService.getAudioContext();

    // Check 1: Is the context fundamentally unusable?
    if (!this._audioContext || this._audioContext.state === 'closed') {
        const message = `AudioEngineService.setOutputDevice: AudioContext is not available or is closed (state: ${this._audioContext?.state}). Cannot set SinkId to '${sinkId}'.`;
        console.warn(message);
        this._audioInitializationError = this._audioInitializationError || message; // Preserve existing error or set this one
        // Do not change _selectedSinkId if the context is fundamentally broken.
        this._notifySubscribers();
        // We should throw an error here because the operation cannot be completed as requested.
        throw new Error(`Cannot set output device: AudioContext is ${this._audioContext?.state || 'null'}.`);
    }

    // Check 2: Does the current (valid, open) context support setSinkId?
    if (!this._audioContextService.canChangeOutputDevice()) {
        // This means this._audioContext.setSinkId function is likely not available.
        const message = `AudioEngineService.setOutputDevice: AudioContext (state: ${this._audioContext.state}) does not support setSinkId functionality. Cannot set SinkId to '${sinkId}'.`;
        console.warn(message);
        this._audioInitializationError = this._audioInitializationError || message;
        // Do not change _selectedSinkId if the feature is unsupported.
        this._notifySubscribers();
        // Throw an error as the feature is not supported.
        throw new Error('setSinkId is not supported by the current AudioContext.');
    }

    // Normal path: Context is valid, open, and supports setSinkId.
    try {
        console.log(`AudioEngineService.setOutputDevice: Attempting to set output device to ${sinkId}. Context state: ${this._audioContext.state}`);
        await this._audioContextService.setSinkId(sinkId); // This call is now made on a known-good context
        this._selectedSinkId = sinkId; // Update only on success
        console.log(`AudioEngineService: Output device successfully set to: ${this._selectedSinkId}`);
        this._audioInitializationError = null; // Clear error on success
    } catch (error) {
        const errorMessage = `AudioEngineService: Error setting output device to '${sinkId}': ${(error as Error).message}`;
        console.error(errorMessage, error);
        this._selectedSinkId = oldSinkId; // Revert to old sinkId on failure
        this._audioInitializationError = this._audioInitializationError || errorMessage;
        this._notifySubscribers(); // Notify before throwing so UI can update with reverted sinkId and error
        throw error; // Re-throw
    } finally {
        // _notifySubscribers() is called here in original code, but specific error/success paths above handle it.
        // If we want a guaranteed notification after any attempt:
        this._notifySubscribers();
    }
};

    public listOutputDevices = async (): Promise<void> => {
        try {
            const devices = await this._audioContextService.getAvailableOutputDevices();
            this._availableOutputDevices = devices;
            if (!this._selectedSinkId && devices.length > 0) {
                // If no device is selected, pick the default one or the first one.
                const defaultDevice = devices.find(d => d.deviceId === 'default') || devices[0];
                if (defaultDevice) {
                    this._selectedSinkId = defaultDevice.deviceId;
                }
            }
        } catch (error) {
            console.error('Error listing output devices:', error);
            this._availableOutputDevices = [];
            this._audioInitializationError = `Failed to list output devices: ${(error as Error).message}`;
        } finally {
            this._notifySubscribers();
        }
    };

    public removeAllManagedNodes = (): void => {
        this.audioWorkletManager.removeAllManagedWorkletNodes();
        this.nativeNodeManager.removeAllManagedNativeNodes();
        // Lyria services might have their own cleanup, TBD
        this._notifySubscribers(); // If UI depends on node list
    };

    public updateAudioGraphConnections = (/* parameters based on useAudioEngine's version */): void => {
        // This method will need to be fleshed out.
        // It involves reconnecting nodes, potentially based on some graph representation.
        // For now, it's a placeholder.
        console.log("updateAudioGraphConnections called. Implementation pending.");
        // Potentially, re-connect masterGainNode if it was disconnected
        if (this._audioContext && this._masterGainNode && this._masterGainNode.numberOfOutputs === 0) {
             this._masterGainNode.connect(this._audioContext.destination);
        }
        this._notifySubscribers(); // If graph changes affect UI
    };

    // Exposing manager methods (examples)
    public addManagedAudioWorkletNode = (name: string, options?: AudioWorkletNodeOptions): AudioWorkletNode | undefined => {
        return this.audioWorkletManager.addNode(name, options);
    }

    public removeManagedAudioWorkletNode = (nodeId: string): void => {
        this.audioWorkletManager.removeNode(nodeId);
    }

    public getManagedAudioWorkletNodeInfo = (nodeId: string): AudioNodeInfo | undefined => {
        return this.audioWorkletManager.getNodeInfo(nodeId);
    }

    public getAllManagedAudioWorkletNodeInfo = (): AudioNodeInfo[] => {
        return this.audioWorkletManager.getAllNodeInfo();
    }

    public sendManagedAudioWorkletNodeMessage = (nodeId: string, message: ManagedAudioWorkletNodeMessage): void => {
        this.audioWorkletManager.sendMessage(nodeId, message);
    }

    public addNativeNode = (type: string, options?: AudioNodeOptions): AudioNode | undefined => {
        return this.nativeNodeManager.addNode(type, options);
    }

    public removeNativeNode = (nodeId: string): void => {
        this.nativeNodeManager.removeNode(nodeId);
    }

    public getNativeNodeInfo = (nodeId: string): AudioNodeInfo | undefined => {
        return this.nativeNodeManager.getNodeInfo(nodeId);
    }

    public getAllNativeNodeInfo = (): AudioNodeInfo[] => {
        return this.nativeNodeManager.getAllNodeInfo();
    }

    public triggerNativeNodeEnvelope = (nodeId: string, params: EnvelopeParams, triggerTime?: number): void => {
        this.nativeNodeManager.triggerEnvelope(nodeId, params, triggerTime);
    }

    // Placeholder for LyriaServiceManager methods if any were directly exposed
    // public someLyriaServiceMethod = (...args) => this.lyriaServiceManager.someMethod(...args);

    public dispose = (): void => {
        console.log('Disposing AudioEngineService...');
        if (this._audioContext && this._audioContext.state !== 'closed') {
            // Disconnect master gain node
            if (this._masterGainNode) {
                this._masterGainNode.disconnect();
                this._masterGainNode = null;
            }
            // Close audio context
            this._audioContext.close().then(() => {
                console.log('AudioContext closed.');
            }).catch(error => {
                console.error('Error closing AudioContext:', error);
            });
            this._audioContext = null;
        }
        this.removeAllManagedNodes();
        this._subscribers = [];
        this._isAudioGloballyEnabled = false;
        this._audioContextState = null;
        // Notify one last time for any UI cleanup
        // No, don't notify after disposal, subscribers should already be gone or handle this.
        console.log('AudioEngineService disposed.');
    };
}

// Optional: Singleton instance if needed throughout the app
export const audioEngineService = new AudioEngineService();
