// import { Scale as GenAIScale } from '@google/genai'; // Attempting to import as a value/enum.

import { BlockDefinition } from "./block";

// Re-export for easier usage within the app if needed directly

// export { GenAIScale as Scale };



// export interface BlockParameter extends BlockParameterBase {
//   currentValue: any;
// }

// export interface BlockDefinition {
//   id: string; 
//   description?: string;
//   // parameters: BlockParameter[]; 
//   // logicCode?: string; // Removed
//   // initialPrompt?: string;
//   // runsAtAudioRate?: boolean; 
//   // audioWorkletProcessorName?: string; // вернуть после приведения в чувства Gemini
//   // audioWorkletCode?: string; 
//   // logicCodeTests?: string; // Removed
//   // isAiGenerated?: boolean;
//   compactRendererId?: string; // ID for serialization
//   // Transient: Populated at runtime based on compactRendererId
//   compactRendererComponent?: React.FC<CompactRendererProps>;
// }


// export interface EmitterProvider {
//   getEmitter(outputId: string): Tone.Emitter | undefined;
// }



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
  // audioContextState: AudioContextState | null;
  // sampleRate: number | null;
  // status?: "initializing" | "running" | "suspended" | "closed" | "error";
}

// export interface AudioNodeInfo {
//   id: string;
//   type: string;
//   inputs?: string[];
//   outputs?: string[];
//   params?: Record<string, any>;
// }

// export interface ManagedAudioWorkletNodeMessage {
//   type: string;
//   payload?: any;
// }

// export interface AudioWorkletNodeOptions {
//   numberOfInputs?: number;
//   numberOfOutputs?: number;
//   outputChannelCount?: number[];
//   parameterData?: Record<string, number>;
//   processorOptions?: any;
// }

// export interface EnvelopeParams {
//   attackTime: number;
//   decayTime?: number;
//   sustainLevel?: number;
//   releaseTime?: number;
//   peakLevel?: number;
// }




// Centralized Managed Node/Service Info Types
// export interface ManagedWorkletNodeInfo {
//   node: AudioWorkletNode;
//   inputGainNode?: GainNode | null;
//   definitionId?: string;
//   instanceId?: string;
//   definition: BlockDefinition;
// }


// export interface ManagedNativeNodeInfo {
//     node: Tone.ToneAudioNode | AudioNode | AudioWorkletNode | null;
//     nodeForInputConnections: Tone.ToneAudioNode | AudioNode | AudioWorkletNode | null;
//     nodeForOutputConnections: Tone.ToneAudioNode | AudioNode | AudioWorkletNode | null;
//     mainProcessingNode?: Tone.ToneAudioNode | AudioNode | AudioWorkletNode | null;
//     internalGainNode?: GainNode | Tone.Gain;
//     paramTargetsForCv?: Map<string, AudioParam | Tone.Param | Tone.Signal<any>>;
//     definition: BlockDefinition;
//     instanceId: string;
//     // constantSourceValueNode?: ConstantSourceNode;
//     internalState?: any;
//     emitter?: Tone.Emitter;
//     providerInstance?: EmitterProvider;

//     // Add specific Tone.js node references, used by refactored blocks
//     // toneOscillator?: Tone.Oscillator;
//     // toneGain?: Tone.Gain;
//     // toneFilter?: Tone.Filter;
//     // toneFeedbackDelay?: Tone.FeedbackDelay;
//     // toneAmplitudeEnvelope?: Tone.AmplitudeEnvelope;
//     // toneAnalyser?: Tone.Analyser;
// }






// import type { WeightedPrompt as GenAIWeightedPrompt, LiveMusicGenerationConfig as GenAILiveMusicConfig } from '@google/genai';
// import { LiveMusicService } from '@services/LiveMusicService'; // Ensure this is the actual class

// Re-export for easier usage within the app if needed directly
// export type WeightedPrompt = GenAIWeightedPrompt;
// export type LiveMusicGenerationConfig = GenAILiveMusicConfig;


// export enum BlockView {
//   UI = 'UI',
//   CODE = 'CODE',
//   LOGS = 'LOGS',
//   PROMPT = 'PROMPT',
//   CONNECTIONS = 'CONNECTIONS',
//   TESTS = 'TESTS', 
// }


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
