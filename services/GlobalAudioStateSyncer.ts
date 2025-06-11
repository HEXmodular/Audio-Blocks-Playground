// services/GlobalAudioStateSyncer.ts
import { AudioEngineService } from './AudioEngineService'; // Assuming path
import { AudioDevice } from '../types'; // Assuming path

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
    const newState: GlobalAudioState = {
      isAudioGloballyEnabled: this.audioEngineService.isAudioGloballyEnabled,
      availableOutputDevices: [...this.audioEngineService.availableOutputDevices],
      selectedSinkId: this.audioEngineService.selectedSinkId,
      audioContextState: this.audioEngineService.audioContext?.state || null,
      isWorkletSystemReady: this.audioEngineService.audioWorkletManager.isAudioWorkletSystemReady,
    };
    this.currentState = newState;
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
