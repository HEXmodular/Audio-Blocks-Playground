/**
 * This service acts as a synchronizer and broadcaster for global audio-related state derived from the main `AudioEngineService`.
 * It subscribes to state changes within the `AudioEngineService` and maintains a curated snapshot of key audio status indicators.
 * These indicators include whether audio is globally enabled, the list of available output devices, the currently selected sink ID, the audio context's state, and the readiness of the AudioWorklet system.
 * The syncer then exposes this aggregated `GlobalAudioState` to its own subscribers, providing a simplified and focused view of the overall audio status.
 * This allows other application components to easily react to important global audio events without needing to subscribe to the more granular `AudioEngineService` directly.
 */
// services/GlobalAudioStateSyncer.ts
import * as Tone from 'tone'; // Added Tone
import AudioEngineServiceInstance from '@services/AudioEngineService'; // Corrected import
import { AudioDevice } from '@interfaces/common';

// Define the state structure this class will manage
export interface GlobalAudioState {
  isAudioGloballyEnabled: boolean;
  availableOutputDevices: AudioDevice[];
  selectedSinkId: string | null;
  audioContextState: AudioContextState | null;
  isWorkletSystemReady: boolean;
}

export class GlobalAudioStateSyncer {
  private audioEngineService: typeof AudioEngineServiceInstance; // Corrected type
  private listeners: Array<(state: GlobalAudioState) => void> = [];
  public currentState: GlobalAudioState;

  constructor(passedAudioEngineService: typeof AudioEngineServiceInstance) { // Corrected param type
    this.audioEngineService = passedAudioEngineService; // Use passed instance
    this.currentState = {
      isAudioGloballyEnabled: this.audioEngineService.isAudioGloballyEnabled,
      availableOutputDevices: [...this.audioEngineService.availableOutputDevices],
      selectedSinkId: this.audioEngineService.selectedSinkId,
      audioContextState: Tone.getContext()?.state || null, // Use Tone.getContext()
      isWorkletSystemReady: this.audioEngineService.audioWorkletManager.isAudioWorkletSystemReady,
    };

    this.audioEngineService.subscribe(this.handleAudioEngineChange); // Assuming subscribe method exists on the instance
  }

  private handleAudioEngineChange = () => {
    const newEngineState = this.audioEngineService.audioEngineState; // Get the comprehensive state
    const newGlobalState: GlobalAudioState = {
      isAudioGloballyEnabled: newEngineState.isAudioGloballyEnabled,
      availableOutputDevices: [...newEngineState.availableOutputDevices],
      selectedSinkId: newEngineState.selectedSinkId,
      audioContextState: Tone.getContext()?.state || null, // Use Tone.getContext()
      isWorkletSystemReady: this.audioEngineService.audioWorkletManager.isAudioWorkletSystemReady,
    };
      this.currentState = newGlobalState;
      this.notifyListeners();
  };

  public subscribe = (listener: (state: GlobalAudioState) => void): (() => void) => {
    this.listeners.push(listener);
    // Immediately notify the new listener with the current state
    listener(this.currentState);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  };

  private notifyListeners = () => {
    this.listeners.forEach(listener => listener(this.currentState));
  };

  public dispose = () => {
    // Unsubscribe from audioEngineService is not directly available in the provided App.tsx,
    // but if AudioEngineService had an unsubscribe method, it should be called here.
    // For now, we'll just clear listeners.
    this.listeners = [];
    // Assuming AudioEngineService.subscribe returns an unsubscribe function
    // and it was stored, e.g., this.unsubscribeFromAudioEngine = audioEngineService.subscribe(...)
    // if (this.unsubscribeFromAudioEngine) {
    //   this.unsubscribeFromAudioEngine();
    // }
  };
}
