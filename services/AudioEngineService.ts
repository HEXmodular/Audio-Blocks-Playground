import * as Tone from 'tone';
import AudioContextService from './AudioContextService';
// import NativeNodeManager from './NativeNodeManager'; // Removed, functionality merged into AudioNodeManager
import AudioWorkletManager from './AudioWorkletManager';
import LyriaServiceManager from './LyriaServiceManager';
import  AudioGraphConnectorService  from './AudioGraphConnectorService';
import { BlockDefinition, BlockInstance, BlockParameter, Connection, AudioEngineState, OutputDevice } from '@interfaces/common';
import { InstanceUpdatePayload } from '@state/BlockStateManager'; // Added imports

import BlockStateManager from '@state/BlockStateManager';
import AudioNodeManager from './AudioNodeManager';

// Removed onStateChangeForReRender constant as NativeNodeManager is merged

class AudioEngineService {
  private static instance: AudioEngineService;
  public context: Tone.BaseContext | null = null; // Made public for easier access by other services if needed
  private masterVolume: Tone.Volume | null = null;



  // State properties
  public isAudioGloballyEnabled: boolean = false;
  public availableOutputDevices: OutputDevice[] = []; // Changed type to OutputDevice[]
  public selectedSinkId: string | null = 'default'; // Default to 'default'
  private _audioEngineStateSubscribers: Array<(state: AudioEngineState) => void> = [];


  private constructor() {
    // Initialize managers
    this.toggleGlobalAudio = this.toggleGlobalAudio.bind(this);
    this.queryOutputDevices();
  }

  public static getInstance(): AudioEngineService {
    if (!AudioEngineService.instance) {
      AudioEngineService.instance = new AudioEngineService();
    }
    return AudioEngineService.instance;
  }

  public async initialize(): Promise<void> {
    // console.log(`[AudioEngineService initialize] Starting initialization. Tone.getContext().state: ${Tone.getContext().state}`); // REMOVED
    try {
      this.context = Tone.getContext();
      Tone.setContext(this.context);

      if (!this.masterVolume) {
        this.masterVolume = new Tone.Volume(0).connect(Tone.getDestination());
        // console.log(`[AudioEngineService initialize] MasterVolume created. Volume: ${this.masterVolume.volume.value}, Mute: ${this.masterVolume.mute}`); // REMOVED
      } else {
        this.masterVolume.disconnect();
        this.masterVolume.connect(Tone.getDestination());
        // console.log(`[AudioEngineService initialize] MasterVolume already existed, reconnected. Volume: ${this.masterVolume.volume.value}, Mute: ${this.masterVolume.mute}`); // REMOVED
      }

      const rawCtx = this.context.rawContext as AudioContext | null;
      AudioNodeManager.setAudioContext(rawCtx); // Changed from NativeNodeManager
      AudioWorkletManager.setAudioContext(rawCtx);
      LyriaServiceManager.setAudioContext(rawCtx);
      this.setupNodes();


      if (!Tone.getTransport()) {
        console.error('Tone.Transport is not available after context initialization.'); // Kept error
        throw new Error('Failed to initialize Tone.Transport.');
      }

      this.isAudioGloballyEnabled = true;
      // console.log(`[AudioEngineService initialize] Initialized successfully (node setup and connections handled by setupNodes). Tone.getContext().state: ${Tone.getContext().state}`); // REMOVED
      this.publishAudioEngineState();
    } catch (error) {
      console.error('[AudioEngineService initialize] Error during initialization (which includes setupNodes):', error); // Kept error
      this.isAudioGloballyEnabled = false;
      this.publishAudioEngineState();
      // console.log(`[AudioEngineService initialize] Initialization failed. Tone.getContext().state: ${Tone.getContext().state}`); // REMOVED
      throw error;
    }
  }

  // --- State Management and Subscription ---
  public get audioEngineState(): AudioEngineState {
    return {
      isAudioGloballyEnabled: this.isAudioGloballyEnabled,
      audioInitializationError: null, // TODO: Populate this if/when an error occurs
      availableOutputDevices: this.availableOutputDevices,
      selectedSinkId: this.selectedSinkId,
      audioContextState: this.context?.state ?? null,
      sampleRate: this.context?.sampleRate ?? null,
      isWorkletSystemReady: AudioWorkletManager.isAudioWorkletSystemReady,
    };
  }

  public subscribe(listener: (state: AudioEngineState) => void): () => void {
    this._audioEngineStateSubscribers.push(listener);
    listener(this.audioEngineState); // Immediately notify with current state
    return () => {
      this._audioEngineStateSubscribers = this._audioEngineStateSubscribers.filter(l => l !== listener);
    };
  }

  private publishAudioEngineState(): void {
    const state = this.audioEngineState;
    this._audioEngineStateSubscribers.forEach(listener => listener(state));
  }

  // --- Method Implementations (selected) ---
  public async toggleGlobalAudio(): Promise<void> {
    // console.log('[AudioEngineService toggleGlobalAudio] Method called.'); // REMOVED
    // console.log(`[AudioEngineService toggleGlobalAudio] isAudioGloballyEnabled before toggle: ${this.isAudioGloballyEnabled}`); // REMOVED

    if (!this.context) {
      // console.log('[AudioEngineService toggleGlobalAudio] Context not initialized, attempting to initialize.'); // REMOVED
      await this.initialize();
      if (!this.context) {
        console.error("[AudioEngineService toggleGlobalAudio] Cannot toggle audio: AudioContext not available after initialization attempt."); // Kept error
        this.isAudioGloballyEnabled = false;
        this.publishAudioEngineState();
        return;
      }
    }

    if (this.context.state === 'suspended') {
      // console.log(`[AudioEngineService toggleGlobalAudio] Context is suspended, attempting to resume. Current state: ${this.context.state}`); // REMOVED
      await this.context.resume();
      // console.log(`[AudioEngineService toggleGlobalAudio] Context resume attempt completed. New state: ${this.context.state}`); // REMOVED
    }

    this.isAudioGloballyEnabled = !this.isAudioGloballyEnabled;
    // console.log(`[AudioEngineService toggleGlobalAudio] isAudioGloballyEnabled after toggle: ${this.isAudioGloballyEnabled}`); // REMOVED

    if (this.masterVolume) {
      this.masterVolume.mute = !this.isAudioGloballyEnabled;
      // console.log(`[AudioEngineService toggleGlobalAudio] MasterVolume mute set to: ${this.masterVolume.mute}`); // REMOVED
    } else {
      console.warn('[AudioEngineService toggleGlobalAudio] MasterVolume node not available to set mute state.'); // Kept warn
    }

    if (this.isAudioGloballyEnabled) {
      // console.log("[AudioEngineService toggleGlobalAudio] Audio globally enabled. Starting transport."); // REMOVED
      this.stopTransport();
      this.startTransport();
    } else {
      // console.log("[AudioEngineService toggleGlobalAudio] Audio globally disabled. Stopping transport."); // REMOVED
      this.stopTransport();
    }
    this.publishAudioEngineState();
  }

  public async setOutputDevice(sinkId: string): Promise<void> {
    if (this.context && (this.context.rawContext as any).setSinkId) {
      try {
        await (this.context.rawContext as any).setSinkId(sinkId);
        this.selectedSinkId = sinkId;
        console.log(`Audio output device set to: ${sinkId}`);
      } catch (error) {
        console.error(`Error setting audio output device: ${sinkId}`, error);
        throw error;
      }
    } else {
      console.warn('setSinkId is not supported by this browser or context.');
      throw new Error('setSinkId not supported.');
    }
    this.publishAudioEngineState();
  }

  private async queryOutputDevices(): Promise<void> {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.availableOutputDevices = devices.filter(
                (device): device is OutputDevice => device.kind === 'audiooutput'
            );
            if (!this.selectedSinkId && this.availableOutputDevices.length > 0) {
                // If no sinkId is selected, and we have devices, select the default one.
                // Or, if current selectedSinkId is not in the new list, reset to default.
                const defaultDevice = this.availableOutputDevices.find(d => d.deviceId === 'default');
                this.selectedSinkId = defaultDevice ? 'default' : (this.availableOutputDevices[0]?.deviceId || null);
            }
             this.publishAudioEngineState();
        } catch (error) {
            console.error("Error enumerating audio devices:", error);
        }
    }
  }

  // public removeAllManagedNodes(): void {
  //   this.nativeNodeManager.removeAllManagedNativeNodes();
  //   this.audioWorkletManager.removeAllManagedAudioWorkletNodes();
  //   // Lyria services might need similar cleanup
  //   this.lyriaServiceManager.removeAllServices?.();
  //   console.log("All managed nodes removed from AudioEngineService.");
  //   this.publishAudioEngineState(); // State might change (e.g. if nodes were part of metrics)
  // }

  // // --- Delegated methods to NativeNodeManager ---
  // These methods are no longer needed as AudioNodeManager handles this internally.
  // public async addNativeNode(instanceId: string, definition: BlockDefinition, initialParams: BlockParameter[], currentBpm?: number): Promise<boolean> {
  //   return NativeNodeManager.setupManagedNativeNode(instanceId, definition, initialParams, currentBpm);
  // }
  // public removeNativeNode(instanceId: string): void {
  //   NativeNodeManager.removeManagedNativeNode(instanceId);
  // }

  // // --- Delegated methods to AudioWorkletManager ---
  // public async addManagedAudioWorkletNode(instanceId: string, definition: BlockDefinition, initialParams: BlockParameter[]): Promise<boolean> {
  //   return this.audioWorkletManager.setupManagedAudioWorkletNode(instanceId, definition, initialParams);
  // }
  // public removeManagedAudioWorkletNode(instanceId: string): void {
  //   this.audioWorkletManager.removeManagedAudioWorkletNode(instanceId);
  // }
  //  public sendManagedAudioWorkletNodeMessage(instanceId: string, message: any): void {
  //   this.audioWorkletManager.sendManagedAudioWorkletNodeMessage(instanceId, message);
  // }

  // --- AudioGraphConnectorService related ---
  public updateAudioGraphConnections(
  ): void {
    // console.log("[AudioEngineService updateAudioGraphConnections] Method called, preparing to update connections."); // REMOVED
    const rawContextForConnector = Tone.getContext().rawContext;
    const instanceUpdates: InstanceUpdatePayload[] = AudioGraphConnectorService.updateConnections();
    // console.log("[AudioEngineService updateAudioGraphConnections] Instance updates from AudioGraphConnectorService:", instanceUpdates); // REMOVED
  

    if (instanceUpdates && instanceUpdates.length > 0) {
      BlockStateManager.updateMultipleBlockInstances(instanceUpdates);

      // BlockStateManager has updated the instances.
      // Now, notify relevant node managers if their managed instances were affected,
      // especially for internal state changes like emitter propagation.
      // instanceUpdates.forEach(payload => {
      //     const updatedInstance = blockInstances.find(b => b.instanceId === payload.instanceId);
      //     if (updatedInstance) {
      //         const definition = getDefinitionForBlock(updatedInstance);
      //         if (definition) {
      //             // Check if this is a native block that NativeNodeManager would handle
      //             const isNativeBlock = this.nativeNodeManager.getNodeInfo(updatedInstance.instanceId) !== undefined;

      //             if (isNativeBlock) {
      //                 // Check if the update likely involved internalState.emitters.
      //                 let internalStateChanged = false;
      //                 if (typeof payload.updates === 'function') {
      //                     // If it's a function, it's harder to inspect here without re-running it.
      //                     // Assume for now it might have changed internalState if it's an emitter-related update.
      //                     internalStateChanged = true;
      //                 } else {
      //                     internalStateChanged = payload.updates.internalState !== undefined;
      //                 }

      //                 if (internalStateChanged) {
      //                     console.log(`[AudioEngineService] Notifying NativeNodeManager for instance ${updatedInstance.instanceId} due to potential emitter change.`);
      //                     // We need the currentBpm. Assuming it's available globally or via a service.
      //                     // For now, let's retrieve it from Tone.Transport as a fallback.
      //                     const currentBpm = Tone.getTransport().bpm.value;
      //                     this.nativeNodeManager.updateManagedNativeNodeParams(
      //                         updatedInstance.instanceId,
      //                         updatedInstance.parameters, // Pass current parameters
      //                         undefined, // currentInputs is undefined as per new design
      //                         currentBpm
      //                     );
      //                 }
      //             }
      //             // TODO: Similar logic for AudioWorkletManager if its blocks also use emitters via internalState
      //         }
      //     }
      // });
    }
  }

   public getSampleRate(): number | null {
    return this.context?.sampleRate ?? null;
  }

  public startTransport(): void {
    const currentTransportState = Tone.getTransport().state;
    // console.log(`[AudioEngineService startTransport] Attempting to start transport. Current transport state: ${currentTransportState}`); // REMOVED

    if (currentTransportState === 'started') {
      console.warn('[AudioEngineService startTransport] Transport is already running. Cannot start again.'); // Kept warn
      return;
    }
    try {
      Tone.getTransport().start();
      // console.log('[AudioEngineService startTransport] Tone.getTransport().start() called successfully.'); // REMOVED
    } catch (error) {
      console.error('[AudioEngineService startTransport] Error starting Tone.Transport:', error); // Kept error
    }
  }

  public stopTransport(): void {
    const currentTransportState = Tone.getTransport().state;
    // console.log(`[AudioEngineService stopTransport] Attempting to stop transport. Current transport state: ${currentTransportState}`); // REMOVED
    try {
      Tone.getTransport().stop();
      // console.log('[AudioEngineService stopTransport] Tone.getTransport().stop() called successfully.'); // REMOVED
      // Optionally, cancel all scheduled events upon stopping
      // Tone.getTransport().cancel(0);
    } catch (error) {
      console.error('[AudioEngineService stopTransport] Error stopping Tone.Transport:', error); // Kept error
    }
  }

  public pauseTransport(): void {
    try {
      Tone.getTransport().pause();
      console.log('Tone.Transport paused.');
    } catch (error) {
      console.error('Error pausing Tone.Transport:', error);
    }
  }

  public getTransportState(): "started" | "stopped" | "paused" {
    return Tone.getTransport().state;
  }

  public setTransportBpm(bpm: number): void {
    try {
      Tone.getTransport().bpm.value = bpm;
      console.log(`Tone.Transport BPM set to ${bpm}.`);
    } catch (error) {
      console.error('Error setting Tone.Transport BPM:', error);
    }
  }

  public scheduleEvent(callback: (time: number) => void, time: Tone.Unit.Time): number {
    if (!this.context || this.context.state !== 'running') {
      console.warn('Audio context not running. Cannot schedule event.');
      // Consider if this should throw an error or return a specific value
      throw new Error('Audio context not running. Cannot schedule event.');
    }
    try {
      const eventId = Tone.getTransport().schedule(callback, time);
      return eventId;
    } catch (error) {
      console.error('Error scheduling event:', error);
      throw error;
    }
  }

  public clearEvent(eventId: number): void {
    try {
      Tone.getTransport().clear(eventId);
      console.log(`Cleared event with ID: ${eventId}`);
    } catch (error) {
      console.error(`Error clearing event with ID ${eventId}:`, error);
    }
  }

  public scheduleLoop(
    callback: (time: number) => void,
    interval: Tone.Unit.Time,
    startTime?: Tone.Unit.Time
  ): Tone.Loop {
    if (!this.context || this.context.state !== 'running') {
      console.warn('Audio context not running. Cannot schedule loop.');
      throw new Error('Audio context not running. Cannot schedule loop.');
    }
    try {
      const loop = new Tone.Loop(callback, interval);
      if (startTime !== undefined) {
        loop.start(startTime);
      } else {
        loop.start(0); // Start immediately relative to the Transport's timeline if no specific time
      }
      return loop;
    } catch (error) {
      console.error('Error scheduling loop:', error);
      throw error;
    }
  }

  // Method to set master volume
  public setMasterVolume(level: Tone.Unit.Decibels): void {
    console.log('[AudioEngineService setMasterVolume] Received level:', { level, typeofLevel: typeof level });
    if (this.masterVolume) {
      this.masterVolume.volume.value = level;
      console.log('[AudioEngineService setMasterVolume] Value after setting:', { volumeValue: this.masterVolume.volume.value, muteState: this.masterVolume.mute });
      console.log(`Master volume set to ${level} dB.`);
    } else {
      console.warn('Master volume node not initialized.');
    }
  }

  public setupNodes = async () => {
    try {
      await AudioNodeManager.processAudioNodeSetupAndTeardown();
      this.updateAudioGraphConnections(); // Call after nodes are processed
    } catch (error) {
      console.error("Error during processAudioNodeSetupAndTeardown or subsequent connection update:", error);
      // setGlobalError("Failed to process audio nodes or update connections: " + (error as Error).message);
    }
  };
}

export default AudioEngineService.getInstance();
