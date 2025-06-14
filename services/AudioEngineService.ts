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
// import { AUDIO_OUTPUT_BLOCK_DEFINITION } from '@constants/constants'; // Removed
import { AudioOutputNativeBlock } from '@services/native-blocks/AudioOutputNativeBlock'; // Added
import { AudioContextService } from './AudioContextService';
import { AudioGraphConnectorService } from './AudioGraphConnectorService';
import { AudioWorkletManager } from './AudioWorkletManager';
import { NativeNodeManager } from './NativeNodeManager';
import { LyriaServiceManager } from './LyriaServiceManager';
import {
    OutputDevice,
    AudioEngineState,
    // AudioNodeInfo, // Removed unused import
    ManagedAudioWorkletNodeMessage,
    // AudioWorkletNodeOptions, // This was unused, removing import based on previous type-check
    Connection,
    BlockInstance,
    BlockDefinition,
    // BlockParameterDefinition, // Added
    BlockParameter,
    ManagedWorkletNodeInfo, // Import from common
    ManagedNativeNodeInfo,  // Import from common
    // ManagedLyriaServiceInfo // Removed unused import
} from '@interfaces/common';

export class AudioEngineService {
    private _audioContext: AudioContext | null = null;
    private _masterGainNode: GainNode | null = null;
    private _isAudioGloballyEnabled = false;
    private _audioInitializationError: string | null = null;
    private _availableOutputDevices: OutputDevice[] = [];
    private _selectedSinkId: string | null = null;
    private _subscribers: (() => void)[] = [];
    private _audioContextService: AudioContextService;
    private _outputWorkletConnections: Map<string, AudioWorkletNode> = new Map();

    // Removed getAudioOutputDefinition static method

    public audioWorkletManager: AudioWorkletManager;
    public nativeNodeManager: NativeNodeManager;
    public lyriaServiceManager: LyriaServiceManager;
    private audioGraphConnectorService: AudioGraphConnectorService;

    constructor() {
        this._audioContextService = new AudioContextService(this._notifySubscribers.bind(this));
        // Initialize managers with null context initially, will be set by initializeBasicAudioContext
        this.audioWorkletManager = new AudioWorkletManager(null, this._notifySubscribers.bind(this));
        this.nativeNodeManager = new NativeNodeManager(null, this._notifySubscribers.bind(this));
        this.lyriaServiceManager = new LyriaServiceManager(this._notifySubscribers.bind(this)); // Pass nulls if constructor expects them
        this.audioGraphConnectorService = new AudioGraphConnectorService();

        // Removed AudioWorkletManager registration for AudioOutputNativeBlock:
        // this.audioWorkletManager.registerWorkletDefinition(AudioOutputNativeBlock.getDefinition());

        this.initializeBasicAudioContext();
        this.listOutputDevices();
    }

    // Subscription model
    public subscribe(callback: () => void): () => void {
        this._subscribers.push(callback);
        return () => this.unsubscribe(callback);
    }

    public unsubscribe(callback: () => void): void {
        this._subscribers = this._subscribers.filter(sub => sub !== callback);
    }

    private _notifySubscribers(): void {
        // this._updateCounter++;
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
            // updateCounter: this._updateCounter,
        };
    }

public initializeBasicAudioContext = async (): Promise<void> => {
    if (this._audioContext && this._audioContext.state !== 'closed') {
        console.warn('AudioContext already initialized and not closed. Current state:', this._audioContext.state);
        return;
    }
    this._audioInitializationError = null;
    try {
        console.log("AudioEngineService: Attempting to initialize AudioContext via AudioContextService...");
        const initResult = await this._audioContextService.initialize(false);
        this._audioContext = initResult.context;

        this._audioContext = initResult.context;

        if (!this._audioContext) { // Handles if initResult.context is null
            console.warn("AudioEngineService: AudioContextService.initialize returned a null context.");
            this.audioWorkletManager._setAudioContext(null);
            this.nativeNodeManager._setAudioContext(null);
            this.lyriaServiceManager._setAudioContextAndMasterGain(null, null);
            const errorMessage = `Failed to initialize AudioContext: context is null.`;
            console.error(`AudioEngineService: ${errorMessage}`);
            this._audioInitializationError = errorMessage;
            this._isAudioGloballyEnabled = false;
            // Do not throw here for the dispose test, allow constructor to complete.
            // The error state is logged and _audioContext is null.
            // Subsequent operations in this method might need to be skipped.
            this._notifySubscribers(); // Notify about the error state
            return; // Exit early if context is null
        }

        if (this._audioContext.state === 'closed') {
            console.warn(`AudioEngineService: Initializing with an already closed AudioContext. Proceeding as if no context initially.`);
            this.audioWorkletManager._setAudioContext(null);
            this.nativeNodeManager._setAudioContext(null);
            this.lyriaServiceManager._setAudioContextAndMasterGain(null, null);
            this._audioInitializationError = `Initialized with a closed AudioContext.`;
            this._isAudioGloballyEnabled = false;
            this._audioContext = null; // Treat as if no context was available
            this._notifySubscribers(); // Notify about this state
            return; // Exit early
        }

        this.audioWorkletManager._setAudioContext(this._audioContext);
        this.nativeNodeManager._setAudioContext(this._audioContext);

        console.log(`AudioEngineService: AudioContext obtained from service. Initial state: ${this._audioContext.state}`);

        if (this._masterGainNode) {
            try { this._masterGainNode.disconnect(); } catch(e) { /* ignore */ }
        }
        this._masterGainNode = this._audioContext.createGain();
        this._masterGainNode.connect(this._audioContext.destination);
        this.lyriaServiceManager._setAudioContextAndMasterGain(this._audioContext, this._masterGainNode);
        console.log("AudioEngineService: Master gain node created and connected.");

        this._isAudioGloballyEnabled = this._audioContext.state === 'running';
        // Detach old handler before assigning new one
        if ((this._audioContext as any)._previousOnStateChangeHandler) {
            (this._audioContext as any).onstatechange = (this._audioContext as any)._previousOnStateChangeHandler;
        }
        (this._audioContext as any)._previousOnStateChangeHandler = this._audioContext.onstatechange; // Store any existing handler

        this._audioContext.onstatechange = () => {
            if (this._audioContext) {
                const currentState = this._audioContext.state;
                console.log(`AudioEngineService: AudioContext state changed to ${currentState}.`);
                if (currentState === 'closed') {
                    this._isAudioGloballyEnabled = false;
                    console.warn("AudioEngineService: AudioContext closed. Audio is now globally disabled.");
                }
            } else {
                console.warn("AudioEngineService: onstatechange triggered but _audioContext is null.");
                this._isAudioGloballyEnabled = false;
            }
            this._notifySubscribers();
            if (typeof (this._audioContext as any)._previousOnStateChangeHandler === 'function') {
                 (this._audioContext as any)._previousOnStateChangeHandler(); // Call previous handler if it exists
            }
        };

        await this.listOutputDevices();

        // At this point, _audioContext is guaranteed to be non-null and its state is not 'closed'
        // due to the checks around lines 155-163. So, the explicit check here is redundant.
        // The original error TS2367 pointed to this redundancy.
        // We can proceed directly if _audioContext exists (which it should).
        if (this._audioContext) { // Keep a null check just in case, though logic implies it's always true.
            const defaultOutput = this._availableOutputDevices.find(d => d.deviceId === 'default') || this._availableOutputDevices[0];
            if (defaultOutput) {
                console.log(`AudioEngineService: Attempting to set default output device to: ${defaultOutput.label} (${defaultOutput.deviceId})`);
                await this.setOutputDevice(defaultOutput.deviceId);
            } else {
                console.log("AudioEngineService: No default output device found or available to set.");
            }
        }
        // The 'else' block where context became invalid is removed as the preceding logic
        // should prevent reaching here if context is null or closed.
        // If _audioContext were null here, it implies a logic flaw earlier.
        console.log(`AudioEngineService: AudioContext initialization process finished. Final state: ${this._audioContext?.state}, GloballyEnabled: ${this._isAudioGloballyEnabled}`);

    // At this point, _audioContext is guaranteed to be non-null and not 'closed'.
    try {
        // audioWorkletManager's context is set prior, and it's non-null / not 'closed'.
        const workletsRegistered = await this.audioWorkletManager.checkAndRegisterPredefinedWorklets(true);
        this.audioWorkletManager.setIsAudioWorkletSystemReady(workletsRegistered);
        if (!workletsRegistered) {
            this._audioInitializationError = this._audioInitializationError || 'Failed to register all predefined audio worklets.';
        }
    } catch (workletError) {
        this.audioWorkletManager.setIsAudioWorkletSystemReady(false);
        this._audioInitializationError = this._audioInitializationError || `Error setting up audio worklets: ${(workletError as Error).message}`;
    }

    } catch (error) {
        const specificErrorMessage = `Error during AudioContext initialization in AudioEngineService: ${(error as Error).message}`;
        console.error(specificErrorMessage);
        this._audioInitializationError = specificErrorMessage;
        this._isAudioGloballyEnabled = false;

        if (this._masterGainNode) {
            try { this._masterGainNode.disconnect(); } catch (e) { /* ignore */ }
            this._masterGainNode = null;
        }
        if (!this._audioContext || this._audioContext.state === 'closed') {
            this._audioContext = null;
        }
        // this._audioContextState = this._audioContext?.state ?? null; // Removed assignment to unused member
    } finally {
        this._notifySubscribers();
    }
};

    public toggleGlobalAudio = async (): Promise<void> => {
        if (!this._audioContext) {
            await this.initializeBasicAudioContext();
            if (!this._audioContext) return;
        }

        const currentState = this._audioContext.state;
        if (currentState === 'suspended') {
            await this._audioContext.resume();
            // After resume attempt, check the new state.
            if (this._audioContext.state === 'running') {
                if (!this.audioWorkletManager.isAudioWorkletSystemReady) {
                    try {
                        const workletsRegistered = await this.audioWorkletManager.checkAndRegisterPredefinedWorklets(true);
                        this.audioWorkletManager.setIsAudioWorkletSystemReady(workletsRegistered);
                        if (!workletsRegistered) {
                           // this._audioInitializationError = this._audioInitializationError || 'Failed to register all predefined audio worklets post-toggle.';
                        }
                    } catch (workletError) {
                        this.audioWorkletManager.setIsAudioWorkletSystemReady(false);
                       // this._audioInitializationError = this._audioInitializationError || `Error setting up audio worklets post-toggle: ${(workletError as Error).message}`;
                    }
                }
            }
        } else if (currentState === 'running') {
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
    const oldSinkId = this._selectedSinkId;
    this._audioContext = this._audioContextService.getAudioContext();
    if (this.nativeNodeManager && typeof this.nativeNodeManager._setAudioContext === 'function') {
        this.nativeNodeManager._setAudioContext(this._audioContext);
    }
    if (!this._audioContext || this._audioContext.state === 'closed') {
        const message = `AudioEngineService.setOutputDevice: AudioContext is not available or is closed (state: ${this._audioContext?.state}). Cannot set SinkId to '${sinkId}'.`;
        console.warn(message);
        this._audioInitializationError = this._audioInitializationError || message;
        this._notifySubscribers();
        throw new Error(`Cannot set output device: AudioContext is ${this._audioContext?.state || 'null'}.`);
    }
    if (!this._audioContextService.canChangeOutputDevice()) {
        const message = `AudioEngineService.setOutputDevice: AudioContext (state: ${this._audioContext.state}) does not support setSinkId functionality. Cannot set SinkId to '${sinkId}'.`;
        console.warn(message);
        this._audioInitializationError = this._audioInitializationError || message;
        this._notifySubscribers();
        throw new Error('setSinkId is not supported by the current AudioContext.');
    }
    try {
        console.log(`AudioEngineService.setOutputDevice: Attempting to set output device to ${sinkId}. Context state: ${this._audioContext.state}`);
        await this._audioContextService.setSinkId(sinkId);
        this._selectedSinkId = sinkId;
        console.log(`AudioEngineService: Output device successfully set to: ${this._selectedSinkId}`);
        this._audioInitializationError = null;
    } catch (error) {
        const errorMessage = `AudioEngineService: Error setting output device to '${sinkId}': ${(error as Error).message}`;
        console.error(errorMessage, error);
        this._selectedSinkId = oldSinkId;
        this._audioInitializationError = this._audioInitializationError || errorMessage;
        this._notifySubscribers();
        throw error;
    } finally {
        this._notifySubscribers();
    }
};

    public listOutputDevices = async (): Promise<void> => {
        try {
            const devices = await this._audioContextService.getAvailableOutputDevices();
            this._availableOutputDevices = devices;
            if (!this._selectedSinkId && devices.length > 0) {
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
        this.lyriaServiceManager.removeAllManagedLyriaServices(); // Added call for Lyria
        this.audioGraphConnectorService.disconnectAll();

    if (this._masterGainNode) {
      this._outputWorkletConnections.forEach((node, instanceId) => {
        try {
          node.disconnect(this._masterGainNode!);
          console.log(`AudioEngineService.removeAllManagedNodes: Disconnected AUDIO_OUTPUT worklet '${instanceId}' from masterGainNode.`);
        } catch (e) {
          console.error(`AudioEngineService.removeAllManagedNodes: Error disconnecting AUDIO_OUTPUT worklet '${instanceId}':`, e);
        }
      });
    }
    this._outputWorkletConnections.clear();
    console.log("AudioEngineService.removeAllManagedNodes: Cleared all tracked AUDIO_OUTPUT worklet connections.");
        this._notifySubscribers();
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

    if (this._audioContext && this._masterGainNode) {
      blockInstances.forEach(instance => {
        const definition = getDefinitionForBlock(instance);
        if (!definition) {
          return;
        }
        // Handle AudioOutputNativeBlock specifically for master gain connection
        if (definition.id === AudioOutputNativeBlock.getDefinition().id) {
          const nativeNodeInfo = this.nativeNodeManager.getManagedNodesMap().get(instance.instanceId);
          const mainOutputNode = nativeNodeInfo?.mainProcessingNode; // This is the GainNode for AudioOutputNativeBlock

          if (mainOutputNode && this._masterGainNode) {
            // Always attempt to disconnect first to prevent duplicate connections
            try {
              mainOutputNode.disconnect(this._masterGainNode);
            } catch (e) {
              // Ignore if not connected or already disconnected
            }

            if (this._isAudioGloballyEnabled && this._audioContext?.state === 'running') {
              try {
                mainOutputNode.connect(this._masterGainNode);
                console.log(`AudioEngineService: Connected AudioOutputNativeBlock (GainNode) '${instance.instanceId}' to masterGainNode.`);
              } catch (e) {
                console.error(`AudioEngineService: Error connecting AudioOutputNativeBlock (GainNode) '${instance.instanceId}' to masterGainNode:`, e);
              }
            } else {
              console.log(`AudioEngineService: Ensured AudioOutputNativeBlock (GainNode) '${instance.instanceId}' is disconnected (audio not enabled/running).`);
            }
          }
          // Remove from _outputWorkletConnections if it was ever there (e.g. before this refactor)
          if (this._outputWorkletConnections.has(instance.instanceId)) {
            this._outputWorkletConnections.delete(instance.instanceId);
            console.log(`AudioEngineService: Removed AudioOutputNativeBlock instance '${instance.instanceId}' from _outputWorkletConnections tracking.`);
          }
        }
        // NOTE: Other block types that might be worklets and output directly would need their own handling
        // to be added to _outputWorkletConnections if they are intended as global outputs.
        // Currently, no other block type is explicitly managed this way for master gain output.
      });

      // Cleanup for _outputWorkletConnections:
      // This map should now only contain true AudioWorkletNodes that are global outputs.
      // (Currently, after the refactor, no block type is actively added to this map as a worklet output.)
      // This loop will remove any node from _outputWorkletConnections if its instanceId is no longer in the current blockInstances.
      const activeBlockInstanceIds = new Set(blockInstances.map(inst => inst.instanceId));
      this._outputWorkletConnections.forEach((workletNode, instanceId) => {
        if (!activeBlockInstanceIds.has(instanceId)) {
          try {
            if (this._masterGainNode) {
              workletNode.disconnect(this._masterGainNode);
            }
            this._outputWorkletConnections.delete(instanceId);
            console.log(`AudioEngineService: Cleaned up stale AudioWorkletNode connection from _outputWorkletConnections for '${instanceId}'.`);
          } catch (e) {
            console.error(`AudioEngineService: Error cleaning up stale AudioWorkletNode connection for '${instanceId}':`, e);
          }
        }
      });
    }
    this._notifySubscribers();
  };

    public addManagedAudioWorkletNode = async (instanceId: string, definition: BlockDefinition, initialParams: BlockParameter[]): Promise<boolean> => {
        return this.audioWorkletManager.setupManagedAudioWorkletNode(instanceId, definition, initialParams);
    }

    public removeManagedAudioWorkletNode = (nodeId: string): void => {
        this.audioWorkletManager.removeManagedAudioWorkletNode(nodeId); // Corrected method name
    }

    public getManagedAudioWorkletNodeInfo = (nodeId: string): ManagedWorkletNodeInfo | undefined => { // Changed return type
        return this.audioWorkletManager.getManagedNodesMap().get(nodeId); // Corrected: was getNodeInfo
    }

    public getAllManagedAudioWorkletNodeInfo = (): ManagedWorkletNodeInfo[] => { // Changed return type
        return Array.from(this.audioWorkletManager.getManagedNodesMap().values()); // Corrected: was getAllNodeInfo
    }

    public sendManagedAudioWorkletNodeMessage = (nodeId: string, message: ManagedAudioWorkletNodeMessage): void => {
        this.audioWorkletManager.sendManagedAudioWorkletNodeMessage(nodeId, message); // Corrected: was sendMessage
    }

    public addNativeNode = async (instanceId: string, definition: BlockDefinition, initialParams: BlockParameter[], currentBpm?: number): Promise<boolean> => {
        return this.nativeNodeManager.setupManagedNativeNode(instanceId, definition, initialParams, currentBpm);
    }

    public removeNativeNode = (nodeId: string): void => {
        this.nativeNodeManager.removeManagedNativeNode(nodeId);
    }

    public getNativeNodeInfo = (nodeId: string): ManagedNativeNodeInfo | undefined => { // Changed return type
        return this.nativeNodeManager.getManagedNodesMap().get(nodeId);
    }

    public getAllNativeNodeInfo = (): ManagedNativeNodeInfo[] => { // Changed return type
        return Array.from(this.nativeNodeManager.getManagedNodesMap().values()); // Corrected: was getAllNodeInfo
    }

    // public triggerNativeNodeEnvelope = (nodeId: string, _params: EnvelopeParams, _triggerTime?: number): void => {
    //     // This method seems to be a direct call if NativeNodeManager implements it with this exact signature.
    //     // If params is meant to be broken down, this call needs adjustment.
    //     // For now, assuming NativeNodeManager has this signature.
    //     // The error was "triggerEnvelope" does not exist, but NativeNodeManager has more specific ones.
    //     // This specific method is not directly on NativeNodeManager, it has specific AD/AR triggers.
    //     // This will require refactoring where it's called, or adding a generic triggerEnvelope to NativeNodeManager.
    //     // For now, commenting out to remove immediate error, needs design decision.
    //     // this.nativeNodeManager.triggerEnvelope(nodeId, params, triggerTime);
    //     console.warn(`AudioEngineService.triggerNativeNodeEnvelope called for ${nodeId} but is a placeholder/needs refactor.`);
    // }

    public dispose = (): void => {
        console.log('Disposing AudioEngineService...');
        this.audioGraphConnectorService.disconnectAll();

    if (this._masterGainNode && this._audioContext && this._audioContext.state !== 'closed') {
      this._outputWorkletConnections.forEach((node, instanceId) => {
        try {
          node.disconnect(this._masterGainNode!);
          console.log(`AudioEngineService.dispose: Disconnected AUDIO_OUTPUT worklet '${instanceId}' from masterGainNode.`);
        } catch (e) {
          console.warn(`AudioEngineService.dispose: Error disconnecting AUDIO_OUTPUT worklet '${instanceId}' (may already be disconnected):`, e);
        }
      });
    }
    this._outputWorkletConnections.clear();
    console.log("AudioEngineService.dispose: Cleared all tracked AUDIO_OUTPUT worklet connections during disposal.");

        if (this._audioContext && this._audioContext.state !== 'closed') {
            if (this._masterGainNode) {
                this._masterGainNode.disconnect();
                this._masterGainNode = null;
            }
            this._audioContext.close().then(() => {
                console.log('AudioContext closed.');
            }).catch(error => {
                console.error('Error closing AudioContext:', error);
            });
            this._audioContext = null;
            // _audioContext is now null or was already null/closed
        }
        // Unconditionally ensure managers' contexts are nulled out
        if (this.nativeNodeManager && typeof this.nativeNodeManager._setAudioContext === 'function') {
            this.nativeNodeManager._setAudioContext(null);
        }
        if (this.audioWorkletManager && typeof this.audioWorkletManager._setAudioContext === 'function') {
            this.audioWorkletManager._setAudioContext(null);
        }
        if (this.lyriaServiceManager && typeof this.lyriaServiceManager._setAudioContextAndMasterGain === 'function') {
            this.lyriaServiceManager._setAudioContextAndMasterGain(null, null);
        }

        this.removeAllManagedNodes();
        this._subscribers = [];
        this._isAudioGloballyEnabled = false;
        // this._audioContextState = null; // Removed assignment to unused member
        console.log('AudioEngineService disposed.');
    };
}

export const audioEngineService = new AudioEngineService();
