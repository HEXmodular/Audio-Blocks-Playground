
// Fix: Import LiveMusicGenerationConfig instead of MusicGenerationConfig
// Import LiveMusicGenerationConfig and other necessary types from @google/genai
// Fix: Import GenAIScale as a value
import { GoogleGenAI, type LiveMusicSession, type LiveMusicServerMessage, type WeightedPrompt, type LiveMusicGenerationConfig, Scale as GenAIScale } from '@google/genai';
import { decode, decodeAudioData } from './utils';
import { getCurrentDateAsSeed } from './dateUtils'; // Import the new utility

const MODEL_NAME = 'lyria-realtime-exp';

// Define Scale and MusicGenerationMode locally as they are not direct exports from @google/genai
// For Scale, ensure that values sent to the service are compatible with GenAIScale.
// The local Scale enum is used for UI representation.
export enum Scale {
  C_MAJOR_A_MINOR = "C_MAJOR_A_MINOR",
  // C_SHARP_MAJOR_A_SHARP_MINOR = "C_SHARP_MAJOR_A_SHARP_MINOR", // Removed due to incompatibility with GenAIScale
  D_MAJOR_B_MINOR = "D_MAJOR_B_MINOR",
  D_SHARP_MAJOR_C_MINOR = "D_SHARP_MAJOR_C_MINOR", // Or E_FLAT_MAJOR_C_MINOR
  E_MAJOR_C_SHARP_MINOR = "E_MAJOR_C_SHARP_MINOR",
  F_MAJOR_D_MINOR = "F_MAJOR_D_MINOR",
  F_SHARP_MAJOR_D_SHARP_MINOR = "F_SHARP_MAJOR_D_SHARP_MINOR",
  G_MAJOR_E_MINOR = "G_MAJOR_E_MINOR",
  G_SHARP_MAJOR_F_MINOR = "G_SHARP_MAJOR_F_MINOR",
  A_MAJOR_F_SHARP_MINOR = "A_MAJOR_F_SHARP_MINOR",
  A_SHARP_MAJOR_G_MINOR = "A_SHARP_MAJOR_G_MINOR", // Or B_FLAT_MAJOR_G_MINOR
  B_MAJOR_G_SHARP_MINOR = "B_MAJOR_G_SHARP_MINOR",
  // CHROMATIC = "CHROMATIC", // Removed as per user request
  // Add other scales as needed based on API documentation or expected values
}

export enum MusicGenerationMode {
  QUALITY = "QUALITY",
  LOW_LATENCY = "LOW_LATENCY",
  // Add other modes as needed
}


export type PlaybackState = 'stopped' | 'playing' | 'loading' | 'paused';

export interface LiveMusicServiceCallbacks {
  onPlaybackStateChange: (newState: PlaybackState) => void;
  onFilteredPrompt: (filteredPrompt: { text: string; filteredReason: string }) => void;
  onSetupComplete: () => void; // This is called when setup is complete from server message
  onError: (error: string) => void;
  onClose: (message: string) => void;
  onOutputNodeChanged: (newNode: AudioNode) => void;
  onAudioBufferProcessed?: (buffer: AudioBuffer, bpm: number) => void; // New callback for looper
}

// Re-export MusicGenerationConfig and enums if they are to be used externally by consuming UI
// Scale and MusicGenerationMode are now locally defined and exported.
// Fix: Explicitly re-export WeightedPrompt type for use in other modules.
export type { LiveMusicGenerationConfig, WeightedPrompt };


export const DEFAULT_MUSIC_GENERATION_CONFIG: LiveMusicGenerationConfig = {
  guidance: 4.0,
  bpm: undefined, // Default to unset (auto)
  density: undefined, // Default to unset
  brightness: undefined, // Default to unset
  scale: undefined, // Default to auto (unset), must be compatible with GenAIScale if set
  muteBass: false,
  muteDrums: false,
  onlyBassAndDrums: false,
  // musicGenerationMode: MusicGenerationMode.QUALITY, // Removed: Not part of @google/genai LiveMusicGenerationConfig
  temperature: 1.1, // Default to 1.1
  topK: 40, // Service likely has its own default if this is omitted
  seed: getCurrentDateAsSeed(), 
};

export class LiveMusicService {
  private ai: GoogleGenAI;
  private session: LiveMusicSession | null = null;
  private audioContext: AudioContext;
  private outputNode: GainNode;
  private nextStartTime = 0;
  private readonly bufferTime = 2; // Audio buffer in seconds for network latency
  private connectionError = false;
  private currentPlaybackState: PlaybackState = 'stopped';
  private musicConfig: LiveMusicGenerationConfig; // This uses @google/genai type
  private localMusicMode: MusicGenerationMode = MusicGenerationMode.QUALITY; // Store mode locally if needed for custom logic

  private callbacks: LiveMusicServiceCallbacks;

  // For managing connect() promise resolving after setupComplete
  private setupCompletePromise: Promise<void> | null = null;
  private resolveSetupComplete: (() => void) | null = null;
  private rejectSetupComplete: ((reason?: any) => void) | null = null;
  private isReconnecting = false; // Flag to manage reconnect state


  constructor(
    apiKey: string,
    audioCtx: AudioContext,
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
    this.audioContext = audioCtx;
    this.callbacks = callbacks;
    this.outputNode = this.audioContext.createGain();
    this.musicConfig = { ...DEFAULT_MUSIC_GENERATION_CONFIG, ...initialConfig };
    if (initialMode) {
        this.localMusicMode = initialMode;
    }
  }

  private setPlaybackState(newState: PlaybackState) {
    if (this.currentPlaybackState !== newState) {
      this.currentPlaybackState = newState;
      this.callbacks.onPlaybackStateChange(newState);
      console.log(`[LiveMusicService] Playback state changed to: ${newState}`);
    }
  }

  public getOutputNode(): AudioNode {
    return this.outputNode;
  }

  public getCurrentAudioContextTime(): number {
    return this.audioContext.currentTime;
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

    if (this.session && !this.connectionError && (this.currentPlaybackState === 'paused' || this.currentPlaybackState === 'playing')) {
        console.warn('[LiveMusicService connect] Already connected and in a stable state.');
        this.callbacks.onSetupComplete();
        return Promise.resolve();
    }

    console.log('[LiveMusicService connect] Starting new connection process.');
    this.setPlaybackState('loading');
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
      this.setPlaybackState('stopped');
      this.callbacks.onError(`Connection failed: ${error.message || 'Unknown error'}`);
      if (this.rejectSetupComplete) {
        this.rejectSetupComplete(error);
        this.resolveSetupComplete = null;
        this.rejectSetupComplete = null;
      }
      throw error;
    }
  }

  private async handleServerMessage(e: LiveMusicServerMessage) {
    // console.log('[LiveMusicService handleServerMessage] Received message type:', Object.keys(e)[0]); // Less verbose

    if (e.setupComplete) {
      console.log('[LiveMusicService handleServerMessage] Received setupComplete.');
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

      if (this.currentPlaybackState === 'loading') {
         this.setPlaybackState('paused');
      }
    }
    if (e.filteredPrompt) {
      const { text, filteredReason } = e.filteredPrompt;
      if (typeof text === 'string' && typeof filteredReason === 'string') {
        this.callbacks.onFilteredPrompt({ text, filteredReason });
      }
    }

    if (e.serverContent?.audioChunks !== undefined) {
      if (e.serverContent.audioChunks.length > 0) {
        console.log(`[LiveMusicService] Received ${e.serverContent.audioChunks.length} audio chunk(s). Current playback state: ${this.currentPlaybackState}`);
        if (this.currentPlaybackState === 'paused' || this.currentPlaybackState === 'stopped') {
          console.log(`[LiveMusicService] Discarding audio chunk because playback state is ${this.currentPlaybackState}.`);
          return;
        }

        try {
          const audioData = e.serverContent.audioChunks[0].data;
          if (!audioData) {
            console.warn("[LiveMusicService] Received audio chunk with no data.");
            return;
          }
          const decodedBytes = decode(audioData);
          const audioBuffer = await decodeAudioData(
            decodedBytes,
            this.audioContext,
            48000, 
            2, 
          );
          
          console.log(`[LiveMusicService] Decoded audio buffer. Duration: ${audioBuffer.duration.toFixed(3)}s. Channels: ${audioBuffer.numberOfChannels}, Sample Rate: ${audioBuffer.sampleRate}`);


          if (this.callbacks.onAudioBufferProcessed) {
            const config = this.getCurrentMusicGenerationConfig(); 
            this.callbacks.onAudioBufferProcessed(audioBuffer, config.bpm ?? DEFAULT_MUSIC_GENERATION_CONFIG.bpm ?? 120); 
          }

          const source = this.audioContext.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(this.outputNode);

          const currentTime = this.audioContext.currentTime;
          if (this.nextStartTime === 0) { 
            this.nextStartTime = currentTime + this.bufferTime;
            console.log(`[LiveMusicService] First chunk. Scheduling to start at: ${this.nextStartTime.toFixed(3)} (current: ${currentTime.toFixed(3)})`);
          } else if (this.nextStartTime < currentTime) { 
            console.warn(`[LiveMusicService] Buffer underrun. NextStartTime: ${this.nextStartTime.toFixed(3)}, CurrentTime: ${currentTime.toFixed(3)}. Re-buffering.`);
            this.setPlaybackState('loading'); // Indicate re-buffering
            this.nextStartTime = currentTime + this.bufferTime;
            this.callbacks.onError('Audio buffer underrun, re-buffering.');
          }
          
          source.start(this.nextStartTime);
          
          // If we were loading and now have scheduled audio, we are effectively playing.
          if (this.currentPlaybackState === 'loading') {
              this.setPlaybackState('playing');
          }
          console.log(`[LiveMusicService] Scheduled audio chunk to play at ${this.nextStartTime.toFixed(3)}. Next chunk will start at ${ (this.nextStartTime + audioBuffer.duration).toFixed(3)}.`);
          this.nextStartTime += audioBuffer.duration;

        } catch (decodeError: any) {
          this.callbacks.onError(`Error processing received audio data: ${decodeError.message}`);
          console.error('[LiveMusicService] Decode/Processing Error:', decodeError);
          this.pause(); // Pause on error to prevent further issues
          return;
        }
      } else {
        console.log("[LiveMusicService] Received serverContent with empty audioChunks array.");
      }
    }
  }

  private handleError(e: ErrorEvent) {
    console.error('[LiveMusicService handleError]', e);
    this.connectionError = true;
    this.setPlaybackState('stopped');
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

    const isConnectingOrActiveDuringOldClose = this.currentPlaybackState === 'loading' ||
                                               this.currentPlaybackState === 'paused' ||
                                               this.currentPlaybackState === 'playing';

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

    if (this.currentPlaybackState === 'loading' && isUnexpectedClose && this.rejectSetupComplete) {
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
    if (this.currentPlaybackState === 'loading' && !this.isReconnecting) {
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


    if (this.session && !this.connectionError && (this.currentPlaybackState === 'playing' || this.currentPlaybackState === 'paused' || this.isReconnecting)) {
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
    try {
        await this.audioContext.resume();
    } catch (err: any) {
        console.error("[LiveMusicService play] AudioContext resume failed:", err);
        this.callbacks.onError(`Could not resume audio context: ${err.message}`);
        if (this.currentPlaybackState !== 'stopped') {
            this.setPlaybackState('stopped');
        }
        return;
    }

    let justConnected = false;
    if (!this.isConnected()) {
        console.log('[LiveMusicService play] Not connected. Attempting to connect...');
        this.setPlaybackState('loading');
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
        if (this.currentPlaybackState !== 'stopped') {
            this.setPlaybackState('stopped');
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


    if (this.currentPlaybackState === 'paused' || this.currentPlaybackState === 'stopped') {
        console.log(`[LiveMusicService play] Calling session.play(). Current state before session.play(): ${this.currentPlaybackState}`);
        this.session.play();
        this.setPlaybackState('loading'); // Now waiting for audio chunks
        this.nextStartTime = 0; // Reset for buffering
        this.outputNode.gain.cancelScheduledValues(this.audioContext.currentTime);
        this.outputNode.gain.setValueAtTime(0, this.audioContext.currentTime); // Start from 0 for fade-in
        this.outputNode.gain.linearRampToValueAtTime(1, this.audioContext.currentTime + 0.2);
    } else if (this.currentPlaybackState === 'playing') {
        console.warn(`[LiveMusicService play] Already playing. Command ignored.`);
    } else if (this.currentPlaybackState === 'loading' && !justConnected) {
        console.warn(`[LiveMusicService play] Already loading (and not just connected). Play command potentially redundant.`);
    } else {
         console.warn(`[LiveMusicService play] Not initiating playback due to unexpected state. State: ${this.currentPlaybackState}, justConnected: ${justConnected}.`);
    }
  }

  private resetOutputNode() {
    console.log('[LiveMusicService resetOutputNode] Resetting output node.');
    const oldOutputNode = this.outputNode;
    this.outputNode = this.audioContext.createGain();
    this.callbacks.onOutputNodeChanged(this.outputNode);

    if (oldOutputNode) {
        try {
            oldOutputNode.disconnect();
        } catch(e: any) {
            console.warn("[LiveMusicService resetOutputNode] Error disconnecting old output node:", e.message);
        }
    }
  }

  pause() {
    console.log(`[LiveMusicService pause] Pause called. Current state: ${this.currentPlaybackState}`);
    if (this.currentPlaybackState !== 'playing' && this.currentPlaybackState !== 'loading') {
        if (this.currentPlaybackState === 'paused' || this.currentPlaybackState === 'stopped') {
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
    this.setPlaybackState('paused');
    if (this.outputNode) {
        try {
            this.outputNode.gain.cancelScheduledValues(this.audioContext.currentTime);
            this.outputNode.gain.setValueAtTime(this.outputNode.gain.value, this.audioContext.currentTime);
            this.outputNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.1);
        } catch (e: any) {
            console.warn("[LiveMusicService pause] Error manipulating gain on outputNode:", e.message);
        }
    }
    this.nextStartTime = 0;
  }

  private stopInternally(shouldStopSession: boolean) {
    console.log(`[LiveMusicService stopInternally] Called. shouldStopSession: ${shouldStopSession}, Current state: ${this.currentPlaybackState}, IsReconnecting: ${this.isReconnecting}`);
    const wasPlayingOrLoading = this.currentPlaybackState === 'playing' || this.currentPlaybackState === 'loading';

    if (shouldStopSession && this.session) {
        try {
            this.session.stop();
            console.log("[LiveMusicService stopInternally] session.stop() called.");
        } catch (e: any) {
            console.warn("[LiveMusicService stopInternally] Error stopping session:", e.message);
        }
    }
    this.setPlaybackState('stopped');
     if (this.outputNode) {
        try {
            this.outputNode.gain.cancelScheduledValues(this.audioContext.currentTime);
            if (!this.isReconnecting || shouldStopSession) { // Avoid gain manipulation if it's a reconnect stop without session stop
                this.outputNode.gain.setValueAtTime(this.outputNode.gain.value, this.audioContext.currentTime);
                this.outputNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.1);
            }
        } catch (e: any) {
             console.warn("[LiveMusicService stopInternally] Error manipulating gain on outputNode:", e.message);
        }
    }
    this.nextStartTime = 0;

    if (wasPlayingOrLoading) {
        this.resetOutputNode();
    } else {
        // If not playing/loading, ensure gain is 0 if it's not a reconnect soft-stop
        if (this.outputNode && (!this.isReconnecting || shouldStopSession)) {
             this.outputNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        }
    }
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
    
    this.setPlaybackState('stopped'); 
    if (this.outputNode) {
        try {
            this.outputNode.gain.cancelScheduledValues(this.audioContext.currentTime);
            this.outputNode.gain.setValueAtTime(0, this.audioContext.currentTime); // Ensure gain is 0
        } catch (e: any) {
            console.warn("[LiveMusicService reconnect] Error setting gain to 0 on outputNode before reset:", e.message);
        }
    }
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
    if (this.outputNode) {
      try {
        this.outputNode.disconnect();
      } catch(e: any) {
        console.warn("Error disconnecting output node during dispose:", e.message);
    }
    }
    this.resolveSetupComplete = null;
    this.rejectSetupComplete = null;
    this.setupCompletePromise = null;
    this.isReconnecting = false;
    console.log('[LiveMusicService dispose] Dispose finished.');
  }
}
