/**
 * This service is the central and consolidated audio engine for the application, providing a comprehensive and unified interface for all audio capabilities.
 * It initializes and oversees the core `AudioContext` (via an internal `AudioContextService` instance) and manages audio output devices (leveraging `AudioDeviceService` capabilities through `AudioContextService`).
 * The service integrates and coordinates specialized managers for different types of audio nodes:
 * - `AudioWorkletManager`: For custom audio processing using AudioWorklet nodes.
 * - `NativeNodeManager`: For standard Web Audio API nodes (e.g., GainNode, OscillatorNode).
 * - `LyriaServiceManager`: For Lyria-specific audio functionalities and external service integrations.
 * It is also responsible for managing the connections within the audio graph, using an internal `AudioGraphConnectorService` to establish and update routes between audio nodes.
 * A subscription model allows various application components to listen for and react to changes in audio state, such as device changes, global audio enablement, or AudioContext state transitions.
 * This service consolidates functionalities previously handled by multiple hooks or services and serves as the primary audio interface for the application.
 * Responsibilities include global audio toggling, providing a unified API for node management, and interaction, and is exported as a singleton (`audioEngineService`) for global access.
 */
import { AUDIO_OUTPUT_BLOCK_DEFINITION } from '../constants';
import { AudioContextService } from './AudioContextService';
import { AudioGraphConnectorService } from './AudioGraphConnectorService';
import { AudioWorkletManager, ManagedWorkletNodeInfo } from './AudioWorkletManager';
import { NativeNodeManager, ManagedNativeNodeInfo } from './NativeNodeManager';
import { LyriaServiceManager, ManagedLyriaServiceInfo } from './LyriaServiceManager';
import { OutputDevice, AudioEngineState, AudioNodeInfo, ManagedAudioWorkletNodeMessage, AudioWorkletNodeOptions, EnvelopeParams, Connection, BlockInstance, BlockDefinition, BlockParameter } from '../types';

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
    private _outputWorkletConnections: Map<string, AudioWorkletNode> = new Map();

    public audioWorkletManager: AudioWorkletManager;
    public nativeNodeManager: NativeNodeManager;
    public lyriaServiceManager: LyriaServiceManager;
    private audioGraphConnectorService: AudioGraphConnectorService;

    constructor() {
        this._audioContextService = new AudioContextService(this._notifySubscribers.bind(this));
        this.audioWorkletManager = new AudioWorkletManager(() => this._audioContext, this._notifySubscribers.bind(this));
        this.nativeNodeManager = new NativeNodeManager(() => this._audioContext, this._notifySubscribers.bind(this));
        this.lyriaServiceManager = new LyriaServiceManager(this._notifySubscribers.bind(this));
        this.audioGraphConnectorService = new AudioGraphConnectorService();

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

        // Update NativeNodeManager with the new AudioContext
        if (this.nativeNodeManager && typeof this.nativeNodeManager._setAudioContext === 'function') {
            this.nativeNodeManager._setAudioContext(this._audioContext);
        }

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

    // Update NativeNodeManager with the potentially new AudioContext
    // This should be done early, right after fetching the new context.
    // If the context is null or closed, _setAudioContext should handle it gracefully.
    if (this.nativeNodeManager && typeof this.nativeNodeManager._setAudioContext === 'function') {
        this.nativeNodeManager._setAudioContext(this._audioContext);
    }

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
        this.audioGraphConnectorService.disconnectAll();

    // --- BEGIN MODIFICATION: Disconnect AUDIO_OUTPUT_BLOCK_DEFINITION worklets ---
    if (this._masterGainNode) {
      this._outputWorkletConnections.forEach((node, instanceId) => {
        try {
          node.disconnect(this._masterGainNode!); // Ensure _masterGainNode is not null
          console.log(`AudioEngineService.removeAllManagedNodes: Disconnected AUDIO_OUTPUT worklet '${instanceId}' from masterGainNode.`);
        } catch (e) {
          console.error(`AudioEngineService.removeAllManagedNodes: Error disconnecting AUDIO_OUTPUT worklet '${instanceId}':`, e);
        }
      });
    }
    this._outputWorkletConnections.clear();
    console.log("AudioEngineService.removeAllManagedNodes: Cleared all tracked AUDIO_OUTPUT worklet connections.");
    // --- END MODIFICATION ---
        this._notifySubscribers(); // If UI depends on node list
    };

    public updateAudioGraphConnections = (connections: Connection[], blockInstances: BlockInstance[], getDefinitionForBlock: (instance: BlockInstance) => BlockDefinition | undefined): void => {
        this.audioGraphConnectorService.updateConnections(
            this._audioContext,
            this._isAudioGloballyEnabled,
            connections,
            blockInstances,
            getDefinitionForBlock,
            this.audioWorkletManager.getManagedNodesMap(),
            this.nativeNodeManager.getManagedNodesMap(),
            this.lyriaServiceManager.getManagedInstancesMap()
        );
    // --- BEGIN MODIFICATION: Connect AUDIO_OUTPUT_BLOCK_DEFINITION worklets to masterGainNode ---
    if (this._audioContext && this._masterGainNode) {
      blockInstances.forEach(instance => {
        const definition = getDefinitionForBlock(instance);
        if (definition && definition.id === AUDIO_OUTPUT_BLOCK_DEFINITION.id) {
          const workletInfo = this.audioWorkletManager.getManagedNodesMap().get(instance.instanceId);
          if (workletInfo && workletInfo.node) {
            const workletNode = workletInfo.node;
            const isConnected = this._outputWorkletConnections.has(instance.instanceId);

            if (this._isAudioGloballyEnabled && this._audioContext.state === 'running') {
              if (!isConnected) {
                try {
                  workletNode.connect(this._masterGainNode!);
                  this._outputWorkletConnections.set(instance.instanceId, workletNode);
                  console.log(`AudioEngineService: Connected AUDIO_OUTPUT worklet '${instance.instanceId}' to masterGainNode.`);
                } catch (e) {
                  console.error(`AudioEngineService: Error connecting AUDIO_OUTPUT worklet '${instance.instanceId}' to masterGainNode:`, e);
                }
              }
            } else {
              if (isConnected) {
                try {
                  workletNode.disconnect(this._masterGainNode!);
                  this._outputWorkletConnections.delete(instance.instanceId);
                  console.log(`AudioEngineService: Disconnected AUDIO_OUTPUT worklet '${instance.instanceId}' from masterGainNode.`);
                } catch (e) {
                  console.error(`AudioEngineService: Error disconnecting AUDIO_OUTPUT worklet '${instance.instanceId}' from masterGainNode:`, e);
                }
              }
            }
          }
        }
      });

      // Cleanup stale connections from _outputWorkletConnections if the instance no longer exists
      const currentOutputInstanceIds = new Set(
        blockInstances
          .filter(instance => {
            const def = getDefinitionForBlock(instance);
            return def && def.id === AUDIO_OUTPUT_BLOCK_DEFINITION.id;
          })
          .map(instance => instance.instanceId)
      );

      this._outputWorkletConnections.forEach((node, instanceId) => {
        if (!currentOutputInstanceIds.has(instanceId)) {
          try {
            node.disconnect(this._masterGainNode!);
            this._outputWorkletConnections.delete(instanceId);
            console.log(`AudioEngineService: Cleaned up stale AUDIO_OUTPUT connection for '${instanceId}'.`);
          } catch (e) {
            console.error(`AudioEngineService: Error cleaning up stale AUDIO_OUTPUT connection for '${instanceId}':`, e);
          }
        }
      });
    }
    // --- END MODIFICATION ---
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

    public addNativeNode = async (instanceId: string, definition: BlockDefinition, initialParams: BlockParameter[], currentBpm?: number): Promise<boolean> => {
        return this.nativeNodeManager.setupManagedNativeNode(instanceId, definition, initialParams, currentBpm);
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
        this.audioGraphConnectorService.disconnectAll(); // Ensure all connections are cleared before context is closed

    // --- BEGIN MODIFICATION: Disconnect AUDIO_OUTPUT_BLOCK_DEFINITION worklets during disposal ---
    if (this._masterGainNode && this._audioContext && this._audioContext.state !== 'closed') {
      this._outputWorkletConnections.forEach((node, instanceId) => {
        try {
          node.disconnect(this._masterGainNode!);
          console.log(`AudioEngineService.dispose: Disconnected AUDIO_OUTPUT worklet '${instanceId}' from masterGainNode.`);
        } catch (e) {
          // Errors might occur if nodes are already disconnected or context is closing.
          console.warn(`AudioEngineService.dispose: Error disconnecting AUDIO_OUTPUT worklet '${instanceId}' (may already be disconnected):`, e);
        }
      });
    }
    this._outputWorkletConnections.clear();
    console.log("AudioEngineService.dispose: Cleared all tracked AUDIO_OUTPUT worklet connections during disposal.");
    // --- END MODIFICATION ---

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
            // Also inform NativeNodeManager that the context is now null
            if (this.nativeNodeManager && typeof this.nativeNodeManager._setAudioContext === 'function') {
                this.nativeNodeManager._setAudioContext(null);
            }
        }
        this.removeAllManagedNodes(); // This will also call disconnectAll again, which is safe.
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
