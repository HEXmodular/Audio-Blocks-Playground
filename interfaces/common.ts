import type { WeightedPrompt as GenAIWeightedPrompt, LiveMusicGenerationConfig as GenAILiveMusicConfig } from '@google/genai';
import { Scale as GenAIScale } from '@google/genai'; // Attempting to import as a value/enum.
import { LiveMusicService } from '@services/LiveMusicService';
import * as Tone from 'tone';

// Re-export for easier usage within the app if needed directly
export type WeightedPrompt = GenAIWeightedPrompt;
export type LiveMusicGenerationConfig = GenAILiveMusicConfig;
export { GenAIScale as Scale };


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
  // logicCode?: string; // Removed
  initialPrompt?: string;
  runsAtAudioRate?: boolean; 
  audioWorkletProcessorName?: string; 
  audioWorkletCode?: string; 
  // logicCodeTests?: string; // Removed
  isAiGenerated?: boolean;
  compactRendererId?: string; // ID for serialization
  // Transient: Populated at runtime based on compactRendererId
  compactRendererComponent?: React.FC<CompactRendererProps>;
}

export interface BlockInstance {
  instanceId: string; 
  definitionId: string; 
  name: string; 
  position: { x: number; y: number }; 
  logs: string[];
  parameters: BlockParameter[]; 
  internalState: {
    emitters?: { [inputId: string]: Tone.Emitter }; // Restored
    needsAudioNodeSetup?: boolean; // выяснить что это такое
    loggedWorkletSystemNotReady?: boolean;
    loggedAudioSystemNotActive?: boolean;
    [key: string]: any;
  };
  lastRunOutputs: Record<string, any>; 
  modificationPrompts: string[]; 
  isRunning?: boolean; 
  error?: string | null; 
  audioWorkletNodeId?: string; 
}

export interface EmitterProvider {
  getEmitter(outputId: string): Tone.Emitter | undefined;
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
  // currentLogicCode?: string; // Removed
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


export interface ManagedNativeNodeInfo {
    node: Tone.ToneAudioNode | AudioNode | AudioWorkletNode | null;
    nodeForInputConnections: Tone.ToneAudioNode | AudioNode | AudioWorkletNode | null;
    nodeForOutputConnections: Tone.ToneAudioNode | AudioNode | AudioWorkletNode | null;
    mainProcessingNode?: Tone.ToneAudioNode | AudioNode | AudioWorkletNode | null;
    internalGainNode?: GainNode | Tone.Gain;
    paramTargetsForCv?: Map<string, AudioParam | Tone.Param | Tone.Signal<any>>;
    definition: BlockDefinition;
    instanceId: string;
    // constantSourceValueNode?: ConstantSourceNode;
    internalState?: any;
    emitter?: Tone.Emitter;
    providerInstance?: EmitterProvider;

    // Add specific Tone.js node references, used by refactored blocks
    // toneOscillator?: Tone.Oscillator;
    // toneGain?: Tone.Gain;
    // toneFilter?: Tone.Filter;
    // toneFeedbackDelay?: Tone.FeedbackDelay;
    // toneAmplitudeEnvelope?: Tone.AmplitudeEnvelope;
    // toneAnalyser?: Tone.Analyser;
}

export interface ManagedLyriaServiceInfo {
    instanceId: string;
    service: LiveMusicService;
    outputNode: AudioNode;
    definition?: BlockDefinition;
}

export enum MusicGenerationMode {
  QUALITY = "QUALITY",
  LOW_LATENCY = "LOW_LATENCY",
}

export interface CompactRendererProps {
  blockInstance: BlockInstance;
  blockDefinition: BlockDefinition;
}
