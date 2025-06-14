import type { WeightedPrompt as GenAIWeightedPrompt, LiveMusicGenerationConfig as GenAILiveMusicConfig } from '@google/genai';
import { LiveMusicService } from '@services/LiveMusicService'; // Ensure this is the actual class

// Re-export for easier usage within the app if needed directly
export type WeightedPrompt = GenAIWeightedPrompt;
export type LiveMusicGenerationConfig = GenAILiveMusicConfig;


export enum BlockView {
  UI = 'UI',
  CODE = 'CODE',
  LOGS = 'LOGS',
  PROMPT = 'PROMPT',
  CONNECTIONS = 'CONNECTIONS',
  TESTS = 'TESTS', 
}

export interface BlockPort {
  id: string; 
  name: string; 
  type: 'number' | 'string' | 'boolean' | 'audio' | 'trigger' | 'any' | 'gate'; 
  description?: string;
  audioParamTarget?: string; 
}

interface BlockParameterBase {
  id: string; 
  name: string; 
  type: 'slider' | 'knob' | 'toggle' | 'select' | 'number_input' | 'text_input' | 'step_sequencer_ui';
  options?: Array<{ value: string | number; label: string }>; 
  min?: number; 
  max?: number; 
  step?: number; 
  defaultValue: any;
  description?: string;
  steps?: number; 
  isFrequency?: boolean;
}

export type BlockParameterDefinition = BlockParameterBase;

export interface BlockParameter extends BlockParameterBase {
  currentValue: any;
}

export interface BlockDefinition {
  id: string; 
  name: string; 
  description?: string;
  inputs: BlockPort[];
  outputs: BlockPort[];
  parameters: BlockParameterDefinition[]; 
  logicCode: string; 
  initialPrompt?: string;
  runsAtAudioRate?: boolean; 
  audioWorkletProcessorName?: string; 
  audioWorkletCode?: string; 
  logicCodeTests?: string; 
  isAiGenerated?: boolean;
}

export interface BlockInstance {
  instanceId: string; 
  definitionId: string; 
  name: string; 
  position: { x: number; y: number }; 
  logs: string[];
  parameters: BlockParameter[]; 
  internalState: {
    needsAudioNodeSetup?: boolean;
    lyriaServiceReady?: boolean;
    autoPlayInitiated?: boolean;
    playRequest?: boolean;
    pauseRequest?: boolean;
    stopRequest?: boolean;
    reconnectRequest?: boolean;
    configUpdateNeeded?: boolean;
    promptsUpdateNeeded?: boolean;
    trackMuteUpdateNeeded?: boolean;
    lastScale?: any;
    lastBrightness?: any;
    lastDensity?: any;
    lastSeed?: any;
    lastTemperature?: any;
    lastGuidanceScale?: any;
    lastTopK?: any;
    lastBpm?: any;
    lastEffectivePrompts?: any[];
    wasPausedDueToGateLow?: boolean;
    prevStopTrigger?: boolean;
    prevReconnectTrigger?: boolean;
    lastMuteBass?: boolean;
    lastMuteDrums?: boolean;
    lastOnlyBassDrums?: boolean;
    loggedWorkletSystemNotReady?: boolean;
    loggedAudioSystemNotActive?: boolean;
    [key: string]: any;
  };
  lastRunOutputs: Record<string, any>; 
  modificationPrompts: string[]; 
  isRunning?: boolean; 
  error?: string | null; 
  audioWorkletNodeId?: string; 
  lyriaServiceInstanceId?: string;
}

export interface Connection {
  id: string;
  fromInstanceId: string;
  fromOutputId: string; 
  toInstanceId: string;
  toInputId: string;   
}

export interface GeminiRequest {
  prompt: string;
  targetBlockInstanceId?: string; 
  currentLogicCode?: string; 
  blockDefinitionContext?: Partial<BlockDefinition>; 
}

export interface PendingConnection {
  fromInstanceId: string;
  fromPort: BlockPort;
  fromIsOutput: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export type AudioContextState = "suspended" | "running" | "closed";

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
  isAudioGloballyEnabled: boolean;
  audioInitializationError: string | null;
  availableOutputDevices: OutputDevice[];
  selectedSinkId: string | null;
  audioContextState: AudioContextState | null;
  sampleRate: number | null;
  status?: "initializing" | "running" | "suspended" | "closed" | "error";
}

export interface AudioNodeInfo {
  id: string;
  type: string;
  inputs?: string[];
  outputs?: string[];
  params?: Record<string, any>;
}

export interface ManagedAudioWorkletNodeMessage {
  type: string;
  payload?: any;
}

export interface AudioWorkletNodeOptions {
  numberOfInputs?: number;
  numberOfOutputs?: number;
  outputChannelCount?: number[];
  parameterData?: Record<string, number>;
  processorOptions?: any;
}

export interface EnvelopeParams {
  attackTime: number;
  decayTime?: number;
  sustainLevel?: number;
  releaseTime?: number;
  peakLevel?: number;
}

export type ValueType = 'number' | 'string' | 'boolean' | 'audio' | 'trigger' | 'gate' | 'any' | 'object' | 'array';

export enum PlaybackState {
  STOPPED = "STOPPED",
  PLAYING = "PLAYING",
  PAUSED = "PAUSED",
  LOADING = "LOADING",
  BUFFERING = "BUFFERING",
  ERROR = "ERROR"
}

// Centralized Managed Node/Service Info Types
export interface ManagedWorkletNodeInfo {
  node: AudioWorkletNode;
  inputGainNode?: GainNode | null;
  definitionId?: string;
  instanceId?: string;
  definition: BlockDefinition;
}

export interface AllpassInternalNodes {
    inputPassthroughNode: GainNode;
    inputGain1: GainNode;
    inputDelay: DelayNode;
    feedbackGain: GainNode;
    feedbackDelay: DelayNode;
    summingNode: GainNode;
}

export interface ManagedNativeNodeInfo {
    node: AudioNode;
    nodeForInputConnections: AudioNode;
    nodeForOutputConnections: AudioNode;
    mainProcessingNode?: AudioNode;
    internalGainNode?: GainNode; // <-- ADD THIS LINE
    allpassInternalNodes?: AllpassInternalNodes | null;
    paramTargetsForCv?: Map<string, AudioParam>;
    definition: BlockDefinition;
    instanceId: string;
    constantSourceValueNode?: ConstantSourceNode;
}

export interface ManagedLyriaServiceInfo {
    instanceId: string;
    service: LiveMusicService; // Now uses the actual imported class
    outputNode: AudioNode;
    definition?: BlockDefinition;
}


// Enums for Lyria Service Integration (matching those in LiveMusicService.ts)
export enum Scale {
  C_MAJOR_A_MINOR = "C_MAJOR_A_MINOR",
  D_MAJOR_B_MINOR = "D_MAJOR_B_MINOR",
  D_SHARP_MAJOR_C_MINOR = "D_SHARP_MAJOR_C_MINOR",
  E_MAJOR_C_SHARP_MINOR = "E_MAJOR_C_SHARP_MINOR",
  F_MAJOR_D_MINOR = "F_MAJOR_D_MINOR",
  F_SHARP_MAJOR_D_SHARP_MINOR = "F_SHARP_MAJOR_D_SHARP_MINOR",
  G_MAJOR_E_MINOR = "G_MAJOR_E_MINOR",
  G_SHARP_MAJOR_F_MINOR = "G_SHARP_MAJOR_F_MINOR",
  A_MAJOR_F_SHARP_MINOR = "A_MAJOR_F_SHARP_MINOR",
  A_SHARP_MAJOR_G_MINOR = "A_SHARP_MAJOR_G_MINOR",
  B_MAJOR_G_SHARP_MINOR = "B_MAJOR_G_SHARP_MINOR",
}

export enum MusicGenerationMode {
  QUALITY = "QUALITY",
  LOW_LATENCY = "LOW_LATENCY",
}

/**
 * @google/genai Lyria SDK is not available. This is a conceptual type.
 * Represents a single prompt item for Lyria.
 * Expected structure for 'lyria_prompt' or items in 'prompt_collection'.
 * Use with ports of type 'any'.
 * Example:
 * export interface LyriaPromptItem {
 *   text: string;
 *   weight: number; // Typically 0.0 to 1.0
 * }
 */
