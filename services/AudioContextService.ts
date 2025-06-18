import * as Tone from 'tone';

class AudioContextService {
  private static instance: AudioContextService;
  // Store the global Tone.js context instance
  private audioContext: Tone.Context | null = null;

  private constructor() {
    // Private constructor
  }

  public static getInstance(): AudioContextService {
    if (!AudioContextService.instance) {
      AudioContextService.instance = new AudioContextService();
    }
    return AudioContextService.instance;
  }

  public async getAudioContext(): Promise<Tone.Context> {
    if (!this.audioContext || this.audioContext.state !== 'running') {
      await this.initializeAudioContext();
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.audioContext!;
  }

  public async initializeAudioContext(): Promise<void> {
    // Check if Tone.context is already available and running
    if (Tone.context && Tone.context.state === 'running') {
      this.audioContext = Tone.context;
      console.log('Tone.js AudioContext is already running.');
      return;
    }

    try {
      // Tone.start() initializes and starts the global audio context.
      // It needs to be triggered by a user gesture.
      await Tone.start();
      this.audioContext = Tone.context; // Assign the global context
      console.log('Tone.js AudioContext started successfully via Tone.start().');

      // Ensure the context is indeed running (Tone.start() should handle this)
      if (this.audioContext.state !== 'running') {
        // This block might be redundant if Tone.start() guarantees a running state
        // or throws an error. However, it's a good safeguard.
        console.warn('Tone.context state is not "running" after Tone.start(). Attempting to resume.');
        await this.audioContext.resume();
        console.log('Tone.context resumed.');
      }

      // Additional check, primarily for development/debugging
      if (this.audioContext.state !== 'running') {
        console.error('Failed to start or resume Tone.context. Current state:', this.audioContext.state);
        throw new Error(`Tone.context failed to reach "running" state. Current state: ${this.audioContext.state}`);
      }

    } catch (error) {
      console.error('Error initializing Tone.js AudioContext with Tone.start():', error);
      // If Tone.start() fails, it might be because it wasn't called from a user gesture.
      // In a real application, this needs to be handled gracefully, often by prompting the user to click a button.
      throw error;
    }
  }

  public getContextState(): AudioContextState | null {
    return this.audioContext ? this.audioContext.state : null;
  }

  public async resumeContext(): Promise<void> {
    // This method might be called if the context suspends for some reason (e.g., page visibility change)
    if (this.audioContext && this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
        console.log('Tone.js AudioContext resumed successfully.');
      } catch (error) {
        console.error('Error resuming Tone.js AudioContext:', error);
        throw error;
      }
    } else if (this.audioContext && this.audioContext.state === 'running') {
      console.log('Tone.js AudioContext is already running.');
    } else {
      console.warn('No valid Tone.js AudioContext to resume, or context is not suspended.');
      // Optionally, try to initialize if no context exists
      // await this.initializeAudioContext();
    }
  }
}

export default AudioContextService.getInstance();
