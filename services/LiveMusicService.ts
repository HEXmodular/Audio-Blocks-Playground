/**
 * This service provides an interface to a real-time AI music generation backend, likely Google's Lyria model.
 * It manages the connection lifecycle to the `LiveMusicSession`, handling setup, message exchange, errors, and session closure.
 * Key responsibilities include sending user-defined prompts and generation configurations (like BPM, scale, and instrumental emphasis) to the AI, receiving generated audio chunks, decoding them, and scheduling them for seamless playback via the Web Audio API.
 * The service maintains playback state (playing, paused, stopped, loading), implements audio buffering to mitigate network latency, and uses a system of callbacks to inform the application about important events such as state changes, errors, or newly available audio data.
 * It effectively encapsulates the complexities of interacting with a generative music AI, offering controls for playback and content guidance to the main application.
 */
// Fix: Import LiveMusicGenerationConfig instead of MusicGenerationConfig
// Import LiveMusicGenerationConfig and other necessary types from @google/genai
// Fix: Import GenAIScale as a value
import { GoogleGenAI, type LiveMusicSession, type LiveMusicServerMessage, type WeightedPrompt, type LiveMusicGenerationConfig } from '@google/genai';
import { PlaybackState } from '@interfaces/lyria'; // Import PlaybackState ENUM
import { decode, decodeAudioData } from '@utils/utils';
import { getCurrentDateAsSeed } from '@utils/dateUtils'; // Import the new utility

const MODEL_NAME = 'lyria-realtime-exp';

// Local Scale enum removed, will import from interfaces/common (which re-exports @google/genai's Scale)
import { ToneAudioBuffer } from 'tone';

export enum MusicGenerationMode {
  QUALITY = "QUALITY",
  LOW_LATENCY = "LOW_LATENCY",
  // Add other modes as needed
}

// Removed local PlaybackState type alias, will use enum from common.ts

export interface LiveMusicServiceCallbacks {
  onPlaybackStateChange: (newState: PlaybackState) => void; // Uses imported enum
  onFilteredPrompt: (filteredPrompt: { text: string; filteredReason: string }) => void;
  onSetupComplete: () => void; // This is called when setup is complete from server message
  onError: (error: string) => void;
  onClose: (message: string) => void;
  onOutputNodeChanged: (newNode: AudioNode) => void;
  onAudioBufferProcessed?: (buffer: ToneAudioBuffer) => void; // New callback for looper
}

// Re-export MusicGenerationConfig and enums if they are to be used externally by consuming UI
// Scale and MusicGenerationMode are now locally defined and exported.
// Fix: Explicitly re-export WeightedPrompt type for use in other modules.
export type { LiveMusicGenerationConfig, WeightedPrompt };
export { PlaybackState, Scale }; // Re-export PlaybackState and the centralized Scale


export const DEFAULT_MUSIC_GENERATION_CONFIG: LiveMusicGenerationConfig = {
  guidance: 4.0,
  bpm: undefined, // Default to unset (auto)
  density: undefined, // Default to unset
  brightness: undefined, // Default to unset
  scale: undefined, // Default to auto (unset), uses the imported @google/genai Scale
  muteBass: false,
  muteDrums: false,
  onlyBassAndDrums: false,
  // musicGenerationMode: MusicGenerationMode.QUALITY, // Removed: Not part of @google/genai LiveMusicGenerationConfig
  temperature: 1.1, // Default to 1.1
  topK: 40, // Service likely has its own default if this is omitted
  seed: getCurrentDateAsSeed(),
};

export class LiveMusicService {
  private static instance: LiveMusicService | null = null;

  private ai: GoogleGenAI;
  private session: LiveMusicSession | null = null;
  // private audioContext: AudioContext;
  // private outputNode: Tone.Gain;
  // private nextStartTime = 0; // Removed as playback scheduling is delegated
  // private readonly bufferTime = 2; // Removed as buffering logic is delegated
  private connectionError = false;
  private currentPlaybackState: PlaybackState = PlaybackState.STOPPED; // Use enum
  private musicConfig: LiveMusicGenerationConfig; // This uses @google/genai type
  private localMusicMode: MusicGenerationMode = MusicGenerationMode.QUALITY; // Store mode locally if needed for custom logic

  private callbacks: LiveMusicServiceCallbacks;

  // For managing connect() promise resolving after setupComplete
  private setupCompletePromise: Promise<void> | null = null;
  private resolveSetupComplete: (() => void) | null = null;
  private rejectSetupComplete: ((reason?: any) => void) | null = null;
  private isReconnecting = false; // Flag to manage reconnect state


  private constructor(
    apiKey: string,
    callbacks: LiveMusicServiceCallbacks,
    initialConfig?: Partial<LiveMusicGenerationConfig>,
    initialMode?: MusicGenerationMode // Optional: way to set localMusicMode
  ) {
    if (!apiKey) {
        throw new Error("API_KEY is required to initialize LiveMusicService.");
    }
    this.ai = new GoogleGenAI({ 
      apiKey, 
      apiVersion: 'v1alpha', // Required for Lyria live music
      
      });
    this.callbacks = callbacks;
    this.musicConfig = { ...DEFAULT_MUSIC_GENERATION_CONFIG, ...initialConfig };
    if (initialMode) {
        this.localMusicMode = initialMode;
    }
  }

  public static getInstance(
    apiKey: string,
    // audioCtx: AudioContext,
    callbacks: LiveMusicServiceCallbacks,
    initialConfig?: Partial<LiveMusicGenerationConfig>,
    initialMode?: MusicGenerationMode
  ): LiveMusicService {
    if (LiveMusicService.instance === null) {
      LiveMusicService.instance = new LiveMusicService(
        apiKey,
        callbacks,
        initialConfig,
        initialMode
      );
    } else {
      console.warn(
        "[LiveMusicService getInstance] An instance already exists. New parameters are being ignored."
      );
    }
    return LiveMusicService.instance;
  }

  private setPlaybackState(newState: PlaybackState) {
    if (this.currentPlaybackState !== newState) {
      this.currentPlaybackState = newState;
      this.callbacks.onPlaybackStateChange(newState);
      console.log(`[LiveMusicService] Playback state changed to: ${newState}`);
    }
  }


  public getCurrentMusicGenerationConfig(): Readonly<LiveMusicGenerationConfig> {
    // Return a copy, ensuring undefined fields are preserved
    const configToSend: Partial<LiveMusicGenerationConfig> = {};
    for (const key in this.musicConfig) {
      if (Object.prototype.hasOwnProperty.call(this.musicConfig, key)) {
        const typedKey = key as keyof LiveMusicGenerationConfig;
        if (this.musicConfig[typedKey] !== undefined) {
          (configToSend as any)[typedKey] = this.musicConfig[typedKey];
        }
      }
    }
    return configToSend as LiveMusicGenerationConfig;
  }

  // Getter for local music mode if UI needs it
  public getLocalMusicMode(): MusicGenerationMode {
    return this.localMusicMode;
  }

  // Setter for local music mode, this won't directly send to service
  // but could be used to adjust other parameters in this.musicConfig if needed
  public setLocalMusicMode(mode: MusicGenerationMode): void {
    this.localMusicMode = mode;
    // Example: If mode influences other actual config params:
    // if (mode === MusicGenerationMode.LOW_LATENCY) {
    //   this.setMusicGenerationConfig({ temperature: 0.8 /* other adjustments */ });
    // } else {
    //   this.setMusicGenerationConfig({ temperature: 1.1 /* other adjustments */ });
    // }
  }

  async connect(): Promise<void> {
    if (this.setupCompletePromise && (this.resolveSetupComplete || this.rejectSetupComplete)) {
        console.warn('[LiveMusicService connect] Connection attempt already in progress, returning existing promise.');
        return this.setupCompletePromise;
    }

    if (this.session && !this.connectionError && (this.currentPlaybackState === PlaybackState.PAUSED || this.currentPlaybackState === PlaybackState.PLAYING)) {
        console.warn('[LiveMusicService connect] Already connected and in a stable state.');
        this.callbacks.onSetupComplete();
        return Promise.resolve();
    }

    console.log('[LiveMusicService connect] Starting new connection process.');
    this.setPlaybackState(PlaybackState.LOADING);
    this.connectionError = false;

    this.setupCompletePromise = new Promise<void>((resolve, reject) => {
        this.resolveSetupComplete = resolve;
        this.rejectSetupComplete = reject;
    });

    try {
      this.session = await this.ai.live.music.connect({
        model: MODEL_NAME,
        callbacks: {
          onmessage: async (e: LiveMusicServerMessage) => this.handleServerMessage(e),
          onerror: (e: ErrorEvent) => this.handleError(e),
          onclose: (e: CloseEvent) => this.handleClose(e),
        },
      });
      console.log('[LiveMusicService connect] LiveMusicSession object created. Waiting for setupComplete server message...');
      return this.setupCompletePromise;

    } catch (error: any) {
      console.error('[LiveMusicService connect] Failed to establish LiveMusicSession:', error);
      this.connectionError = true;
      this.setPlaybackState(PlaybackState.STOPPED);
      this.callbacks.onError(`Connection failed: ${error.message || 'Unknown error'}`);
      if (this.rejectSetupComplete) {
        this.rejectSetupComplete(error);
        this.resolveSetupComplete = null;
        this.rejectSetupComplete = null;
      }
      throw error;
    }
  }

  private async _handleSetupCompleteMessage(_setupCompleteData: NonNullable<LiveMusicServerMessage['setupComplete']>) {
    console.log('[LiveMusicService _handleSetupCompleteMessage] Received setupComplete.');
    this.connectionError = false;

    if (this.session) {
      try {
        console.log('[LiveMusicService] Attempting to set initial music config on session after setupComplete.');
        const configToSend: Partial<LiveMusicGenerationConfig> = {};
        for (const key in this.musicConfig) {
          if (Object.prototype.hasOwnProperty.call(this.musicConfig, key)) {
              const typedKey = key as keyof LiveMusicGenerationConfig;
              if (this.musicConfig[typedKey] !== undefined) {
                  (configToSend as any)[typedKey] = this.musicConfig[typedKey];
              }
          }
        }
        await this.session.setMusicGenerationConfig({ musicGenerationConfig: configToSend });
        console.log('[LiveMusicService] Initial music config successfully sent to session.');
      } catch (error: any) {
        console.error('[LiveMusicService] Error setting initial music config on session after setupComplete:', error);
        this.callbacks.onError(`Failed to set initial music config: ${error.message}`);
      }
    } else {
      console.warn('[LiveMusicService] setupComplete received, but session is null. Cannot set initial config.');
    }

    this.callbacks.onSetupComplete();

    if (this.resolveSetupComplete) {
      this.resolveSetupComplete();
    }
    this.resolveSetupComplete = null;
    this.rejectSetupComplete = null;

    if (this.currentPlaybackState === PlaybackState.LOADING) {
       this.setPlaybackState(PlaybackState.PAUSED);
    }
  }

  private async _handleAudioChunksMessage(audioChunks: NonNullable<NonNullable<LiveMusicServerMessage['serverContent']>['audioChunks']>) {
    if (audioChunks.length > 0) {
      // console.log(`[LiveMusicService _handleAudioChunksMessage] Received ${audioChunks.length} audio chunk(s). Current playback state: ${this.currentPlaybackState}`);
      if (this.currentPlaybackState === PlaybackState.PAUSED || this.currentPlaybackState === PlaybackState.STOPPED) {
        console.log(`[LiveMusicService _handleAudioChunksMessage] Discarding audio chunk because playback state is ${this.currentPlaybackState}.`);
        return;
      }

      try {
        const audioData = audioChunks[0].data;
        if (!audioData) {
          console.warn("[LiveMusicService _handleAudioChunksMessage] Received audio chunk with no data.");
          return;
        }
        const decodedBytes = decode(audioData);
        if (!decodedBytes) {
          console.error(`[LiveMusicService] decode audio failed`, {audioData, decodedBytes})
        }

        if (decodedBytes.byteLength === 0) {
          console.error(`[LiveMusicService] decode audio failed no bytes`, {audioData, decodedBytes})
        }

        const audioBuffer = await decodeAudioData(
          decodedBytes,
          48000,
          2,
        );

        if (this.callbacks.onAudioBufferProcessed) {
          this.callbacks.onAudioBufferProcessed(audioBuffer);
        }

        // Playback scheduling and source node creation are now delegated to the consumer.
        // The service's responsibility ends with providing the decoded AudioBuffer.

        // Example of how the service might indicate it's actively sending data,
        // but the consumer would manage its own detailed PLAYING vs. BUFFERING state.
        if (this.currentPlaybackState === PlaybackState.LOADING) {
            // Consider if this state change is still appropriate here or if
            // PlaybackState.PLAYING for the service should mean "actively streaming/connected"
            // rather than "audio is making sound".
            // For now, we'll keep it to show the service is "active".
             this.setPlaybackState(PlaybackState.PLAYING);
        }

      } catch (decodeError: any) {
        this.callbacks.onError(`Error processing received audio data: ${decodeError.message}`);
        console.error('[LiveMusicService _handleAudioChunksMessage] Decode/Processing Error:', decodeError);
        this.pause();
        return;
      }
    } else {
      console.log("[LiveMusicService _handleAudioChunksMessage] Received serverContent with empty audioChunks array.");
    }
  }

  private async handleServerMessage(e: LiveMusicServerMessage) {
    if (e.setupComplete) {
      await this._handleSetupCompleteMessage(e.setupComplete);
    }
    if (e.filteredPrompt) {
      const { text, filteredReason } = e.filteredPrompt;
      if (typeof text === 'string' && typeof filteredReason === 'string') {
        this.callbacks.onFilteredPrompt({ text, filteredReason });
      }
    }
    if (e.serverContent?.audioChunks) {
      await this._handleAudioChunksMessage(e.serverContent.audioChunks);
    }
  }

  private handleError(e: ErrorEvent) {
    console.error('[LiveMusicService handleError]', e);
    this.connectionError = true;
    this.setPlaybackState(PlaybackState.STOPPED);
    this.callbacks.onError(`Session error: ${e.message || 'Unknown error from session'}`);

    if (this.rejectSetupComplete) {
      this.rejectSetupComplete(new Error(e.message || 'Session error during connection process'));
    }
    this.resolveSetupComplete = null;
    this.rejectSetupComplete = null;
  }

  private handleClose(e: CloseEvent) {
    console.log(`[LiveMusicService handleClose] Code: ${e.code}, Reason: '${e.reason}', WasClean: ${e.wasClean}, CurrentState: ${this.currentPlaybackState}, IsReconnecting: ${this.isReconnecting}`);
    if (this.isReconnecting && e.wasClean && e.code === 0) {
        this.callbacks.onClose(`Old session (during reconnect) closed cleanly. Code: ${e.code}, Reason: ${e.reason || 'OK'}`);
        return;
    }

    const isConnectingOrActiveDuringOldClose = this.currentPlaybackState === PlaybackState.LOADING ||
                                               this.currentPlaybackState === PlaybackState.PAUSED ||
                                               this.currentPlaybackState === PlaybackState.PLAYING;

    if (e.wasClean && e.code === 0 && this.session !== null && isConnectingOrActiveDuringOldClose && !this.isReconnecting) {
      // Clean close of an old session, minimal action needed
    }

    const isUnexpectedClose = !(e.wasClean && e.code === 0);

    if (isUnexpectedClose) {
        this.connectionError = true;
    }

    this.stopInternally(false); // Don't try to stop session again if it's already closing

    if (isUnexpectedClose) {
        this.callbacks.onError(`Session closed unexpectedly. Code: ${e.code}, Reason: ${e.reason || 'No reason specified'}`);
    } else {
        this.callbacks.onClose(`Session closed. Code: ${e.code}, Reason: ${e.reason || 'OK'}`);
    }

    if (this.currentPlaybackState === PlaybackState.LOADING && isUnexpectedClose && this.rejectSetupComplete) {
        this.rejectSetupComplete(new Error(`Session closed unexpectedly during connection: ${e.code} ${e.reason}`));
    }
    this.resolveSetupComplete = null;
    this.rejectSetupComplete = null;
  }

  async setWeightedPrompts(prompts: WeightedPrompt[]) {
    console.log('[LiveMusicService setWeightedPrompts] Setting prompts:', prompts);
    if (!this.session || this.connectionError) {
      this.callbacks.onError('Session not available or connection error. Cannot set prompts.');
      if (prompts.length > 0) {
        // this.pause(); // Avoid pausing if simply updating prompts on an already playing session
      }
      return;
    }
    if (this.currentPlaybackState === PlaybackState.LOADING && !this.isReconnecting) {
        console.warn(`[LiveMusicService setWeightedPrompts] Called while state is ${this.currentPlaybackState}. Prompts might not apply immediately if still connecting.`);
    }

    try {
      await this.session.setWeightedPrompts({ weightedPrompts: prompts });
      console.log('[LiveMusicService setWeightedPrompts] Prompts sent successfully.');
    } catch (error: any) {
      this.callbacks.onError(`Failed to set prompts: ${error.message}`);
      console.error('[LiveMusicService setWeightedPrompts] Error:', error);
      // this.pause(); // Avoid pausing if prompt setting fails, let user retry
    }
  }

  async setMusicGenerationConfig(updates: Partial<LiveMusicGenerationConfig>): Promise<void> {
    const oldBpm = this.musicConfig.bpm;
    const oldScale = this.musicConfig.scale;

    console.log('[LiveMusicService setMusicGenerationConfig] Updating with:', updates);
    // Update local musicConfig, preserving undefined for unset fields
    for (const key in updates) {
        if (Object.prototype.hasOwnProperty.call(updates, key)) {
            const typedKey = key as keyof LiveMusicGenerationConfig;
            if (typedKey === 'scale' && updates[typedKey] !== undefined) {
                (this.musicConfig as any)[typedKey] = updates[typedKey] as string; 
            } else {
                 (this.musicConfig as any)[typedKey] = updates[typedKey];
            }
        }
    }
    
    const configToSendToService: Partial<LiveMusicGenerationConfig> = {};
    for (const key in this.musicConfig) {
        if (Object.prototype.hasOwnProperty.call(this.musicConfig, key)) {
            const typedKey = key as keyof LiveMusicGenerationConfig;
            if (this.musicConfig[typedKey] !== undefined) {
                 (configToSendToService as any)[typedKey] = this.musicConfig[typedKey];
            }
        }
    }
    console.log('[LiveMusicService setMusicGenerationConfig] Effective config to send:', configToSendToService);


    if (this.session && !this.connectionError && (this.currentPlaybackState === PlaybackState.PLAYING || this.currentPlaybackState === PlaybackState.PAUSED || this.isReconnecting)) {
      try {
        await this.session.setMusicGenerationConfig({ musicGenerationConfig: configToSendToService });
        console.log('[LiveMusicService setMusicGenerationConfig] Config sent successfully.');

        const bpmChangedInThisUpdate = updates.hasOwnProperty('bpm') && updates.bpm !== oldBpm;
        const scaleChangedInThisUpdate = updates.hasOwnProperty('scale') && updates.scale !== oldScale;

        if (bpmChangedInThisUpdate || scaleChangedInThisUpdate) {
          // Warning handled by UI toast
        }
      } catch (error: any) {
        this.callbacks.onError(`Failed to update music config on session: ${error.message}`);
        console.error('[LiveMusicService setMusicGenerationConfig] Error:', error);
      }
    } else {
        console.warn(`[LiveMusicService setMusicGenerationConfig] Session not ready or in error. Config not sent. State: ${this.currentPlaybackState}, Error: ${this.connectionError}`);
    }
  }

  async play(initialPromptsForFirstPlay?: WeightedPrompt[]) {
    console.log(`[LiveMusicService play] Play called. initialPrompts: ${initialPromptsForFirstPlay ? initialPromptsForFirstPlay.length : 'none'}, Current state: ${this.currentPlaybackState}`);

    let justConnected = false;
    if (!this.isConnected()) {
        console.log('[LiveMusicService play] Not connected. Attempting to connect...');
        this.setPlaybackState(PlaybackState.LOADING);
        try {
            await this.connect();
            if (!this.isConnected()) {
                console.warn('[LiveMusicService play] Connection attempt finished, but service is still not connected.');
                return;
            }
            justConnected = true;
            // After connect() resolves, the state should be 'paused' if setupComplete was successful.
            console.log(`[LiveMusicService play] Connection successful. Current state after connect logic: ${this.currentPlaybackState}.`);
        } catch (error: any) {
            console.error('[LiveMusicService play] Error during connection attempt:', error);
            // connect() already handles error callbacks and state.
            return;
        }
    }

    if (!this.session || this.connectionError) {
        console.warn('[LiveMusicService play] Cannot play, session unavailable or connection error.');
        this.callbacks.onError('Cannot play: session not available or in error state.');
        if (this.currentPlaybackState !== PlaybackState.STOPPED) {
            this.setPlaybackState(PlaybackState.STOPPED);
        }
        return;
    }

    // Ensure prompts are set if this is the first play after connecting, or if new prompts were provided.
    if (initialPromptsForFirstPlay && initialPromptsForFirstPlay.length > 0) {
        console.log('[LiveMusicService play] Setting prompts provided for this play call.');
        try {
            await this.session.setWeightedPrompts({ weightedPrompts: initialPromptsForFirstPlay });
        } catch (error: any) {
            console.error('[LiveMusicService play] Failed to set prompts for play call:', error);
            this.callbacks.onError(`Failed to set prompts: ${error.message}`);
            // Don't necessarily stop/pause here, allow a chance for subsequent calls or manual prompt setting.
            return; // Abort play if prompts can't be set
        }
    }


    if (this.currentPlaybackState === PlaybackState.PAUSED || this.currentPlaybackState === PlaybackState.STOPPED) {
        console.log(`[LiveMusicService play] Calling session.play(). Current state before session.play(): ${this.currentPlaybackState}`);
        this.session.play();
        this.setPlaybackState(PlaybackState.LOADING); // Now waiting for audio chunks
    } else if (this.currentPlaybackState === PlaybackState.PLAYING) {
        console.warn(`[LiveMusicService play] Already playing. Command ignored.`);
    } else if (this.currentPlaybackState === PlaybackState.LOADING && !justConnected) {
        console.warn(`[LiveMusicService play] Already loading (and not just connected). Play command potentially redundant.`);
    } else {
         console.warn(`[LiveMusicService play] Not initiating playback due to unexpected state. State: ${this.currentPlaybackState}, justConnected: ${justConnected}.`);
    }
  }

  private resetOutputNode() {
    console.warn('[LiveMusicService resetOutputNode] Resetting output node.', 'not realised');
  }

  pause() {
    console.log(`[LiveMusicService pause] Pause called. Current state: ${this.currentPlaybackState}`);
    if (this.currentPlaybackState !== PlaybackState.PLAYING && this.currentPlaybackState !== PlaybackState.LOADING) {
        if (this.currentPlaybackState === PlaybackState.PAUSED || this.currentPlaybackState === PlaybackState.STOPPED) {
            console.log(`[LiveMusicService pause] Already ${this.currentPlaybackState}. No action.`);
            return;
        }
    }

    if (this.session) {
      try {
        this.session.pause();
        console.log("[LiveMusicService pause] session.pause() called.");
      } catch (e: any) {
        console.warn("[LiveMusicService pause] Error calling session.pause():", e.message);
      }
    }
    this.setPlaybackState(PlaybackState.PAUSED);

  }

  private stopInternally(shouldStopSession: boolean) {
    console.log(`[LiveMusicService stopInternally] Called. shouldStopSession: ${shouldStopSession}, Current state: ${this.currentPlaybackState}, IsReconnecting: ${this.isReconnecting}`);
    const wasPlayingOrLoading = this.currentPlaybackState === PlaybackState.PLAYING || this.currentPlaybackState === PlaybackState.LOADING;

    if (shouldStopSession && this.session) {
        try {
            this.session.stop();
            console.log("[LiveMusicService stopInternally] session.stop() called.");
        } catch (e: any) {
            console.warn("[LiveMusicService stopInternally] Error stopping session:", e.message);
        }
    }
    this.setPlaybackState(PlaybackState.STOPPED);
  }

  stop() {
    console.log(`[LiveMusicService stop] Stop called. Current state: ${this.currentPlaybackState}`);
    this.stopInternally(true);
  }

  public isConnected(): boolean {
    return !!this.session && !this.connectionError;
  }

  public hasConnectionError(): boolean {
    return this.connectionError;
  }

  public getPlaybackState(): PlaybackState {
    return this.currentPlaybackState;
  }

  public async reconnect() {
    console.log('[LiveMusicService reconnect] Reconnect called.');
    this.isReconnecting = true;

    if (this.session) {
        console.log('[LiveMusicService reconnect] Stopping existing session.');
        try {
            this.session.stop(); 
        } catch (e: any) {
            console.warn("[LiveMusicService reconnect] Error stopping existing session during reconnect:", e.message);
        }
        this.session = null;
    }
    
    this.setPlaybackState(PlaybackState.STOPPED);
    this.resetOutputNode(); 

    this.connectionError = false;
    this.resolveSetupComplete = null;
    this.rejectSetupComplete = null;
    this.setupCompletePromise = null;

    console.log('[LiveMusicService reconnect] Attempting to connect again...');
    try {
        await this.connect(); 
        console.log('[LiveMusicService reconnect] Reconnect: connect() call finished.');
    } catch (error: any) {
        this.callbacks.onError(`Reconnect failed: ${error.message || 'Unknown error'}`);
        console.error('[LiveMusicService reconnect] Error during new connection attempt:', error);
    } finally {
        this.isReconnecting = false;
        console.log('[LiveMusicService reconnect] Reconnect process finished.');
    }
  }

  dispose() {
    console.log('[LiveMusicService dispose] Dispose called.');
    this.stopInternally(true); 
    this.resolveSetupComplete = null;
    this.rejectSetupComplete = null;
    this.setupCompletePromise = null;
    this.isReconnecting = false;
    console.log('[LiveMusicService dispose] Dispose finished.');
  }
}
