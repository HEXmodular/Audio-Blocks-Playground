import * as Tone from 'tone';
import AudioContextService from './AudioContextService';

class AudioEngineService {
  private static instance: AudioEngineService;
  private context: Tone.Context | null = null;
  private masterVolume: Tone.Volume | null = null;
  // Example instrument - can be expanded to manage multiple instruments
  private synth: Tone.Synth | null = null;

  private constructor() {
    // Private constructor
  }

  public static getInstance(): AudioEngineService {
    if (!AudioEngineService.instance) {
      AudioEngineService.instance = new AudioEngineService();
    }
    return AudioEngineService.instance;
  }

  public async initialize(): Promise<void> {
    try {
      this.context = await AudioContextService.getAudioContext();

      // Ensure Tone.Transport is ready. Tone.start() in AudioContextService should handle this.
      // Accessing it via Tone.getTransport() is standard.
      if (!Tone.getTransport()) {
        // This case should ideally not be reached if AudioContextService.initializeAudioContext was successful
        console.error('Tone.Transport is not available after context initialization.');
        throw new Error('Failed to initialize Tone.Transport.');
      }

      // Setup master volume
      this.masterVolume = new Tone.Volume(0).toDestination(); // Default volume to 0 (normal)

      // Setup a default synth
      this.synth = new Tone.Synth().connect(this.masterVolume);

      console.log('AudioEngineService initialized successfully.');
    } catch (error) {
      console.error('Error initializing AudioEngineService:', error);
      // Propagate the error to allow the application to handle it, e.g., by showing a UI message.
      throw error;
    }
  }

  public playNote(note: string, duration: string, time?: Tone.Unit.Time, velocity?: number): void {
    if (!this.synth) {
      console.warn('Synth not initialized. Cannot play note.');
      return;
    }
    if (!this.context || this.context.state !== 'running') {
      console.warn('Audio context not ready or not running. Cannot play note.');
      // Optionally, try to resume context or prompt user
      // AudioContextService.resumeContext();
      return;
    }

    try {
      // If time is provided, it's scheduled. Otherwise, plays immediately.
      this.synth.triggerAttackRelease(note, duration, time, velocity);
    } catch (error) {
      console.error(`Error playing note ${note}:`, error);
    }
  }

  public startTransport(): void {
    if (!this.context || this.context.state !== 'running') {
      console.warn('Audio context not running. Cannot start transport.');
      return;
    }
    try {
      Tone.getTransport().start();
      console.log('Tone.Transport started.');
    } catch (error) {
      console.error('Error starting Tone.Transport:', error);
    }
  }

  public stopTransport(): void {
    try {
      Tone.getTransport().stop();
      console.log('Tone.Transport stopped.');
      // Optionally, cancel all scheduled events upon stopping
      // Tone.getTransport().cancel(0);
    } catch (error) {
      console.error('Error stopping Tone.Transport:', error);
    }
  }

  public pauseTransport(): void {
    try {
      Tone.getTransport().pause();
      console.log('Tone.Transport paused.');
    } catch (error) {
      console.error('Error pausing Tone.Transport:', error);
    }
  }

  public getTransportState(): "started" | "stopped" | "paused" {
    return Tone.getTransport().state;
  }

  public setTransportBpm(bpm: number): void {
    try {
      Tone.getTransport().bpm.value = bpm;
      console.log(`Tone.Transport BPM set to ${bpm}.`);
    } catch (error) {
      console.error('Error setting Tone.Transport BPM:', error);
    }
  }

  public scheduleEvent(callback: (time: number) => void, time: Tone.Unit.Time): number {
    if (!this.context || this.context.state !== 'running') {
      console.warn('Audio context not running. Cannot schedule event.');
      // Consider if this should throw an error or return a specific value
      throw new Error('Audio context not running. Cannot schedule event.');
    }
    try {
      const eventId = Tone.getTransport().schedule(callback, time);
      return eventId;
    } catch (error) {
      console.error('Error scheduling event:', error);
      throw error;
    }
  }

  public clearEvent(eventId: number): void {
    try {
      Tone.getTransport().clear(eventId);
      console.log(`Cleared event with ID: ${eventId}`);
    } catch (error) {
      console.error(`Error clearing event with ID ${eventId}:`, error);
    }
  }

  public scheduleLoop(
    callback: (time: number) => void,
    interval: Tone.Unit.Time,
    startTime?: Tone.Unit.Time
  ): Tone.Loop {
    if (!this.context || this.context.state !== 'running') {
      console.warn('Audio context not running. Cannot schedule loop.');
      throw new Error('Audio context not running. Cannot schedule loop.');
    }
    try {
      const loop = new Tone.Loop(callback, interval);
      if (startTime !== undefined) {
        loop.start(startTime);
      } else {
        loop.start(0); // Start immediately relative to the Transport's timeline if no specific time
      }
      return loop;
    } catch (error) {
      console.error('Error scheduling loop:', error);
      throw error;
    }
  }

  // Method to set master volume
  public setMasterVolume(level: Tone.Unit.Decibels): void {
    if (this.masterVolume) {
      this.masterVolume.volume.value = level;
      console.log(`Master volume set to ${level} dB.`);
    } else {
      console.warn('Master volume node not initialized.');
    }
  }
}

export default AudioEngineService.getInstance();
