import { BlockDefinition } from "./block";

export interface GeminiRequest {
  prompt: string;
  targetBlockInstanceId?: string; 
  // currentLogicCode?: string; // Removed
  blockDefinitionContext?: Partial<BlockDefinition>; 
}

// export type AudioContextState = "suspended" | "running" | "closed";

export interface AudioDevice extends MediaDeviceInfo {
  deviceId: string;
  groupId: string;
  kind: MediaDeviceKind;
  label: string;
  toJSON(): any;
}

export interface OutputDevice extends AudioDevice {
  kind: 'audiooutput';
}

export interface AudioEngineState {
  // isAudioGloballyEnabled: boolean;
  audioInitializationError: string | null;
  availableOutputDevices: OutputDevice[];
  selectedSinkId: string | null;
}
