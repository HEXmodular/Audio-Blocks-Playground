
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

export enum PlaybackState {
    STOPPED = "STOPPED",
    PLAYING = "PLAYING",
    PAUSED = "PAUSED",
    LOADING = "LOADING",
    BUFFERING = "BUFFERING",
    ERROR = "ERROR"
}