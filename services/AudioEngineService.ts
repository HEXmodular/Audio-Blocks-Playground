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

    // Core methods
    public initializeBasicAudioContext = async (): Promise<void> => {
        if (this._audioContext && this._audioContext.state !== 'closed') {
            console.warn('AudioContext already initialized.');
            return;
        }

        try {
            const initResult = await this._audioContextService.initialize(false); // Changed true to false here
            this._audioContext = initResult.context;
            if (!this._audioContext) {
                throw new Error("AudioContext could not be initialized by AudioContextService.");
            }
            this._masterGainNode = this._audioContext.createGain();
            this._masterGainNode.connect(this._audioContext.destination);
            this._isAudioGloballyEnabled = true;
            this._audioInitializationError = null;
            this._audioContextState = this._audioContext.state;

            this._audioContext.onstatechange = () => {
                this._audioContextState = this._audioContext?.state ?? null;
                if (this._audioContext?.state === 'closed') {
                    this._isAudioGloballyEnabled = false;
                    // Potentially reset or alert user
                }
                this._notifySubscribers();
            };

            await this.listOutputDevices();
            // Default to system output if available, or first available
            const defaultOutput = this._availableOutputDevices.find(d => d.deviceId === 'default') || this._availableOutputDevices[0];
            if (defaultOutput) {
                await this.setOutputDevice(defaultOutput.deviceId);
            }

            console.log('AudioContext initialized successfully.');
        } catch (error) {
            console.error('Error initializing AudioContext:', error);
            this._audioInitializationError = (error as Error).message;
            this._isAudioGloballyEnabled = false;
        } finally {
            this._notifySubscribers();
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
        if (!this._audioContext || !this._audioContextService.canChangeOutputDevice()) {
            console.warn('AudioContext not available or does not support setSinkId.');
            const oldSinkId = this._selectedSinkId;
            this._selectedSinkId = sinkId; // Optimistically update
            try {
                await this._audioContextService.setSinkId(sinkId);
            } catch(e) {
                this._selectedSinkId = oldSinkId; //revert on error
                console.error("Failed to set output device:", e);
                this._notifySubscribers();
                throw e;
            }
            this._notifySubscribers();
            return;
        }

        try {
            await this._audioContextService.setSinkId(sinkId);
            this._selectedSinkId = sinkId;
            console.log(`Output device set to: ${sinkId}`);
        } catch (error) {
            console.error('Error setting output device:', error);
            // Optionally, revert to previous sinkId or handle error state
            this._audioInitializationError = `Failed to set output device: ${(error as Error).message}`;
        } finally {
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
// export const audioEngineService = new AudioEngineService();
