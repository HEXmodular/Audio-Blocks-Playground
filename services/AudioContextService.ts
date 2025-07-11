import * as Tone from 'tone';

class AudioContextService {
  private static instance: AudioContextService;
  // Store the global Tone.js context instance
  private audioContext: Tone.BaseContext | null = null;

  private constructor() {
    // Private constructor
  }

  public static getInstance(): AudioContextService {
    if (!AudioContextService.instance) {
      AudioContextService.instance = new AudioContextService();
    }
    return AudioContextService.instance;
  }

  public async getAudioContext(): Promise<Tone.BaseContext> {
    if (!this.audioContext || this.audioContext.state !== 'running') {
      await this.initializeAudioContext();
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.audioContext!;
  }

  public async initializeAudioContext(): Promise<void> {
    // Check if Tone.context is already available and running
    const context = Tone.getContext();
    if (context && context.state === 'running') {
      this.audioContext = context;
      console.log('Tone.js AudioContext is already running.');
      return;
    }

    try {
      // Tone.start() initializes and starts the global audio context.
      // It needs to be triggered by a user gesture.
      await Tone.start();

      if (!Tone.context) {
        // This should ideally not happen if Tone.start() succeeded without error
        console.error('Tone.context is null even after Tone.start() succeeded.');
        throw new Error('Tone.context is null after Tone.start().');
      }
      // Ensure the assigned context is indeed of type Tone.Context.
      // Tone.context is the global singleton, which should be Tone.Context.
      this.audioContext = Tone.context as Tone.Context;
      console.log('Tone.js AudioContext started successfully via Tone.start(). Current state:', this.audioContext.state);

      // Ensure the context is indeed running (Tone.start() should handle this)
      if (this.audioContext.state !== 'running') {
        // This block might be redundant if Tone.start() guarantees a running state
        // or throws an error. However, it's a good safeguard.
        console.warn('Assigned Tone.context state is not "running" after Tone.start(). Attempting to resume.');
        await this.audioContext.resume(); // this.audioContext is now guaranteed non-null here
        console.log('Tone.context resumed. New state:', this.audioContext.state);
      }

      // Additional check, primarily for development/debugging
      if (this.audioContext.state !== 'running') {
        const currentState = this.audioContext.state;
        console.error('Failed to start or resume Tone.context. Current state:', currentState);
        throw new Error(`Tone.context failed to reach "running" state. Current state: ${currentState}`);
      }

    } catch (error) {
      // Clear this.audioContext if initialization failed badly
      this.audioContext = null;
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
