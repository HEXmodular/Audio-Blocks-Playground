
import type { WeightedPrompt as GenAIWeightedPrompt, LiveMusicGenerationConfig as GenAILiveMusicConfig } from '@google/genai';
// import { Scale as GenAIScale } from '@google/genai'; // Attempting to import as a value/enum.
import { LiveMusicService } from '@services/LiveMusicService';
import { BlockDefinition } from './block';

// Re-export for easier usage within the app if needed directly
export type WeightedPrompt = GenAIWeightedPrompt;
export type LiveMusicGenerationConfig = GenAILiveMusicConfig;
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

export enum PlaybackState {
    STOPPED = "STOPPED",
    PLAYING = "PLAYING",
    PAUSED = "PAUSED",
    LOADING = "LOADING",
    BUFFERING = "BUFFERING",
    ERROR = "ERROR"
}