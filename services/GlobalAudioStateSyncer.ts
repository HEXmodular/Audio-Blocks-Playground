/**
 * This service acts as a synchronizer and broadcaster for global audio-related state derived from the main `AudioEngineService`.
 * It subscribes to state changes within the `AudioEngineService` and maintains a curated snapshot of key audio status indicators.
 * These indicators include whether audio is globally enabled, the list of available output devices, the currently selected sink ID, the audio context's state, and the readiness of the AudioWorklet system.
 * The syncer then exposes this aggregated `GlobalAudioState` to its own subscribers, providing a simplified and focused view of the overall audio status.
 * This allows other application components to easily react to important global audio events without needing to subscribe to the more granular `AudioEngineService` directly.
 */
// services/GlobalAudioStateSyncer.ts
import { AudioEngineService } from '@services/AudioEngineService'; // Assuming path
import { AudioDevice } from '@interfaces/common'; // Assuming path

// Define the state structure this class will manage
export interface GlobalAudioState {
  isAudioGloballyEnabled: boolean;
  availableOutputDevices: AudioDevice[];
  selectedSinkId: string | null;
  audioContextState: AudioContextState | null;
  isWorkletSystemReady: boolean;
}

export class GlobalAudioStateSyncer {
  private audioEngineService: AudioEngineService;
  private listeners: Array<(state: GlobalAudioState) => void> = [];
  public currentState: GlobalAudioState;

  constructor(audioEngineService: AudioEngineService) {
    this.audioEngineService = audioEngineService;
    this.currentState = {
      isAudioGloballyEnabled: this.audioEngineService.isAudioGloballyEnabled,
      availableOutputDevices: [...this.audioEngineService.availableOutputDevices],
      selectedSinkId: this.audioEngineService.selectedSinkId,
      audioContextState: this.audioEngineService.audioContext?.state || null,
      isWorkletSystemReady: this.audioEngineService.audioWorkletManager.isAudioWorkletSystemReady,
    };

    this.audioEngineService.subscribe(this.handleAudioEngineChange);
  }

  private handleAudioEngineChange = () => {
    const newEngineState = this.audioEngineService.audioEngineState; // Get the comprehensive state
    const newGlobalState: GlobalAudioState = {
      isAudioGloballyEnabled: newEngineState.isAudioGloballyEnabled,
      // Ensure a new array instance for availableOutputDevices if changed, or for initial population
      availableOutputDevices: [...newEngineState.availableOutputDevices],
      selectedSinkId: newEngineState.selectedSinkId,
      audioContextState: newEngineState.audioContextState,
      // isWorkletSystemReady is not part of AudioEngineState, so get it directly
      isWorkletSystemReady: this.audioEngineService.audioWorkletManager.isAudioWorkletSystemReady,
      // sampleRate is also not in GlobalAudioState, so omitting as per current interface
    };

    let changed = false;
    if (newGlobalState.isAudioGloballyEnabled !== this.currentState.isAudioGloballyEnabled) changed = true;
    if (newGlobalState.selectedSinkId !== this.currentState.selectedSinkId) changed = true;
    if (newGlobalState.audioContextState !== this.currentState.audioContextState) changed = true;
    if (newGlobalState.isWorkletSystemReady !== this.currentState.isWorkletSystemReady) changed = true;

    // Compare availableOutputDevices
    if (!changed) { // Only if no other change has been detected yet
      if (newGlobalState.availableOutputDevices.length !== this.currentState.availableOutputDevices.length) {
        changed = true;
      } else {
        for (let i = 0; i < newGlobalState.availableOutputDevices.length; i++) {
          if (newGlobalState.availableOutputDevices[i].deviceId !== this.currentState.availableOutputDevices[i].deviceId) {
            changed = true;
            break;
          }
          // Optional: compare other properties of AudioDevice if necessary for your definition of "changed"
          // For example, if device labels changing should trigger an update:
          // if (newGlobalState.availableOutputDevices[i].label !== this.currentState.availableOutputDevices[i].label) {
          //   changed = true;
          //   break;
          // }
        }
      }
    }

    if (changed) {
      this.currentState = newGlobalState;
      this.notifyListeners();
    }
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
