

import type { WeightedPrompt as GenAIWeightedPrompt, LiveMusicGenerationConfig as GenAILiveMusicConfig } from '@google/genai';

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
  // Optional field to explicitly map an audio input port to an AudioParam name
  // This helps when port ID convention (e.g., 'freq_in' for AudioParam 'frequency') isn't direct
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
  defaultValue: any; // For 'step_sequencer_ui', this should be boolean[]
  description?: string;
  // Optional: For 'step_sequencer_ui', defines number of steps if not from defaultValue.length.
  // If defaultValue is an array, steps should ideally match defaultValue.length.
  // If defaultValue is not an array (e.g. error or initial setup), steps provides the explicit length.
  steps?: number; 
  isFrequency?: boolean; // Optional hint for note parsing on number_inputs
}

export type BlockParameterDefinition = BlockParameterBase;

export interface BlockParameter extends BlockParameterBase {
  currentValue: any; // For 'step_sequencer_ui', this will be boolean[]
}

export interface BlockDefinition {
  id: string; 
  name: string; 
  description?: string;
  inputs: BlockPort[];
  outputs: BlockPort[];
  parameters: BlockParameterDefinition[]; 
  logicCode: string; 
  initialPrompt: string; 
  runsAtAudioRate?: boolean; 
  audioWorkletProcessorName?: string; 
  audioWorkletCode?: string; 
  logicCodeTests?: string; 
  isAiGenerated?: boolean; // Flag to identify AI-generated blocks
}

export interface BlockInstance {
  instanceId: string; 
  definitionId: string; 
  name: string; 
  position: { x: number; y: number }; 
  logs: string[];
  parameters: BlockParameter[]; 
  internalState: Record<string, any>; 
  lastRunOutputs: Record<string, any>; 
  modificationPrompts: string[]; 
  isRunning?: boolean; 
  error?: string | null; 
  audioWorkletNodeId?: string; 
  lyriaServiceInstanceId?: string; // For Lyria Master block to reference its service
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
  startX: number; // Absolute X of the source port center, relative to SVG canvas
  startY: number; // Absolute Y of the source port center, relative to SVG canvas
  currentX: number; // Current mouse X, relative to SVG canvas
  currentY: number; // Current mouse Y, relative to SVG canvas
}

// Standard AudioContextState type from DOM lib
export type AudioContextState = "suspended" | "running" | "closed";


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
