/**
 * This service is responsible for managing the core Web Audio API `AudioContext`.
 * It handles the initialization, lifecycle (suspend, resume, close), and configuration of the audio context.
 * The service provides access to the `AudioContext` instance, its state, and the master gain node for global volume control.
 * Additionally, it offers utilities for querying available audio output devices and setting the preferred output device (sinkId) if supported by the browser.
 * This service acts as a foundational layer for any audio processing or playback within the application.
 */
import { AudioContextState, OutputDevice } from '../types'; // Assuming AudioContextState is here or define locally

// Define AudioContextState if not available from types.ts
// export type AudioContextState = 'suspended' | 'running' | 'closed' | 'interrupted';


export interface InitAudioResult {
  context: AudioContext | null;
  contextJustResumed?: boolean;
}

export class AudioContextService {
  private context: AudioContext | null = null;
  private masterGainNode: GainNode | null = null;
  private onContextStateChange: (newState: AudioContextState) => void; // Callback for state changes

  constructor(
    onContextStateChange: (newState: AudioContextState) => void
  ) {
    this.onContextStateChange = onContextStateChange;
    console.log('[AudioContextService] Initialized');
  }

  public getAudioContext(): AudioContext | null {
    return this.context;
  }

  public getMasterGainNode(): GainNode | null {
    return this.masterGainNode;
  }

  public getContextState(): AudioContextState | null {
    return this.context?.state ?? null;
  }

  private setContext(newContext: AudioContext | null) {
    if (this.context && this.context !== newContext) {
        // Clean up old context listeners if any were attached directly by the service
        if (this.context.onstatechange) {
            this.context.onstatechange = null;
        }
    }

    this.context = newContext;

    if (newContext) {
        newContext.onstatechange = () => {
            console.log(`[AudioContextService] AudioContext state changed to: ${newContext.state}`);
            this.onContextStateChange(newContext.state);
        };
    }
  }

  public async initialize(resumeContext: boolean = false): Promise<InitAudioResult> {
    let contextJustResumed = false;
    let errorMessage: string | null = null;

    if (this.context && this.context.state === 'closed') {
      console.log("[AudioContextService Init] Existing AudioContext was 'closed'. Cleaning up and creating new one.");
      await this.cleanupContext(); // Ensure previous context is fully cleaned if closed
      this.setContext(null); // Force creation of a new context by nullifying current
      this.masterGainNode = null;
    }

    if (this.context) {
      console.log(`[AudioContextService Init] Existing AudioContext found (state: ${this.context.state}).`);
      if (this.context.state === 'suspended' && resumeContext) {
        console.log("[AudioContextService Init] Attempting to resume existing suspended context...");
        try {
          await this.context.resume();
          contextJustResumed = true;
          console.log(`[AudioContextService Init] Resume attempt finished. Context state: ${this.context.state}.`);
        } catch (resumeError) {
          console.error(`[AudioContextService Init Error] Error resuming existing context: ${(resumeError as Error).message}`);
          errorMessage = `Error resuming context: ${(resumeError as Error).message}`;
        }
      }
    } else {
      console.log("[AudioContextService Init] No existing AudioContext or was closed. Creating new.");
      try {
        const newContext = new AudioContext();
        console.log(`[AudioContextService Init] New AudioContext created (initial state: ${newContext.state}).`);

        this.setContext(newContext); // This also sets up onstatechange

        if (this.masterGainNode) {
            try { this.masterGainNode.disconnect(); } catch(e) { /* ignore */ }
        }
        this.masterGainNode = newContext.createGain();
        this.masterGainNode.connect(newContext.destination);
        console.log("[AudioContextService Init] Master gain node created and connected.");


        if (newContext.state === 'suspended' && resumeContext) {
          // Do not resume here on initial creation if it's suspended.
          // The first resume should be triggered by a user gesture.
          // We will still set contextJustResumed to false as it wasn't resumed by this path.
          console.log("[AudioContextService Init] New context is suspended. User gesture will be needed to resume.");
          contextJustResumed = false;
        }
      } catch (creationError) {
        const msg = `Critical Error initializing new AudioContext: ${(creationError as Error).message}`;
        console.error(`[AudioContextService Init Critical Error] ${msg}`);
        errorMessage = msg;
        if (this.context) await this.cleanupContext(); // Clean up partially initialized context
        this.setContext(null);
        this.masterGainNode = null;
      }
    }

    // If there was an error, the context might be null or in a bad state.
    // The hook will be responsible for setting its own error state based on this result.
    return {
        context: this.context,
        contextJustResumed: contextJustResumed && this.context?.state === 'running',
        // errorMessage: errorMessage // Optionally return error message directly
    };
  }

  public async suspendContext(): Promise<void> {
    if (this.context && this.context.state === 'running') {
      console.log("[AudioContextService] Suspending AudioContext.");
      await this.context.suspend();
      console.log(`[AudioContextService] AudioContext suspended. State: ${this.context.state}`);
    } else {
      console.warn("[AudioContextService] AudioContext not running or not initialized, cannot suspend.");
    }
  }

  public async resumeContext(): Promise<void> {
    if (this.context && this.context.state === 'suspended') {
      console.log("[AudioContextService] Resuming AudioContext.");
      await this.context.resume();
      console.log(`[AudioContextService] AudioContext resumed. State: ${this.context.state}`);
    } else {
      console.warn("[AudioContextService] AudioContext not suspended or not initialized, cannot resume.");
    }
  }

  public getSampleRate(): number | null {
    return this.context?.sampleRate || null;
  }

  public async cleanupContext(): Promise<void> {
    console.log("[AudioContextService] Cleaning up AudioContext.");
    if (this.masterGainNode) {
        try { this.masterGainNode.disconnect(); } catch(e) { /* ignore */ }
        this.masterGainNode = null;
    }
    if (this.context) {
        if (this.context.onstatechange) {
            this.context.onstatechange = null; // Clear listener
        }
        if (this.context.state !== 'closed') {
            try {
                await this.context.close();
                console.log("[AudioContextService] AudioContext closed.");
            } catch (e) {
                console.error(`[AudioContextService] Error closing AudioContext: ${(e as Error).message}`);
            }
        }
        this.setContext(null);
    }
  }

  public async getAvailableOutputDevices(): Promise<OutputDevice[]> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        console.warn('[AudioContextService] enumerateDevices() not supported.');
        return [];
    }
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter(device => device.kind === 'audiooutput').map(device => ({
            deviceId: device.deviceId,
            groupId: device.groupId,
            kind: device.kind,
            label: device.label || `Output device ${devices.filter(d => d.kind === 'audiooutput').indexOf(device) + 1}`
        }));
    } catch (err) {
        console.error('[AudioContextService] Error listing output devices:', err);
        return [];
    }
  }

  public canChangeOutputDevice(): boolean {
    return !!(this.context && typeof (this.context as any).setSinkId === 'function');
  }

  public async setSinkId(sinkId: string): Promise<void> {
    if (!this.context) {
        console.warn('[AudioContextService] AudioContext not available, cannot set sink ID.');
        return Promise.reject('AudioContext not available');
    }
    if (typeof (this.context as any).setSinkId !== 'function') {
        console.warn('[AudioContextService] AudioContext.setSinkId is not supported by this browser.');
        return Promise.reject('setSinkId not supported');
    }
    try {
        await (this.context as any).setSinkId(sinkId);
        console.log(`[AudioContextService] Output device set to: ${sinkId}`);
    } catch (error) {
        console.error('[AudioContextService] Error setting output device:', error);
        throw error; // Re-throw the error to be handled by the caller
    }
  }
}
