import { AudioContextState } from '../types'; // Assuming AudioContextState is here or define locally

// Define AudioContextState if not available from types.ts
// export type AudioContextState = 'suspended' | 'running' | 'closed' | 'interrupted';


export interface InitAudioResult {
  context: AudioContext | null;
  contextJustResumed?: boolean;
}

export class AudioContextService {
  private context: AudioContext | null = null;
  private masterGainNode: GainNode | null = null;
  private appLog: (message: string, isSystem?: boolean) => void;
  private onContextStateChange: (newState: AudioContextState) => void; // Callback for state changes

  constructor(
    appLog: (message: string, isSystem?: boolean) => void,
    onContextStateChange: (newState: AudioContextState) => void
  ) {
    this.appLog = appLog;
    this.onContextStateChange = onContextStateChange;
    this.appLog('[AudioContextService] Initialized', true);
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
            this.appLog(`[AudioContextService] AudioContext state changed to: ${newContext.state}`, true);
            this.onContextStateChange(newContext.state);
        };
    }
  }

  public async initialize(forceNoResume: boolean = false): Promise<InitAudioResult> {
    let contextJustResumed = false;
    let errorMessage: string | null = null;

    if (this.context && this.context.state === 'closed') {
      this.appLog("[AudioContextService Init] Existing AudioContext was 'closed'. Cleaning up and creating new one.", true);
      await this.cleanupContext(); // Ensure previous context is fully cleaned if closed
      this.setContext(null); // Force creation of a new context by nullifying current
      this.masterGainNode = null;
    }

    if (this.context) {
      this.appLog(`[AudioContextService Init] Existing AudioContext found (state: ${this.context.state}).`, true);
      if (this.context.state === 'suspended' && !forceNoResume) {
        this.appLog("[AudioContextService Init] Attempting to resume existing suspended context...", true);
        try {
          await this.context.resume();
          contextJustResumed = true;
          this.appLog(`[AudioContextService Init] Resume attempt finished. Context state: ${this.context.state}.`, true);
        } catch (resumeError) {
          this.appLog(`[AudioContextService Init Error] Error resuming existing context: ${(resumeError as Error).message}`, true);
          errorMessage = `Error resuming context: ${(resumeError as Error).message}`;
        }
      }
    } else {
      this.appLog("[AudioContextService Init] No existing AudioContext or was closed. Creating new.", true);
      try {
        const newContext = new AudioContext();
        this.appLog(`[AudioContextService Init] New AudioContext created (initial state: ${newContext.state}).`, true);

        this.setContext(newContext); // This also sets up onstatechange

        if (this.masterGainNode) {
            try { this.masterGainNode.disconnect(); } catch(e) { /* ignore */ }
        }
        this.masterGainNode = newContext.createGain();
        this.masterGainNode.connect(newContext.destination);
        this.appLog("[AudioContextService Init] Master gain node created and connected.", true);


        if (newContext.state === 'suspended' && !forceNoResume) {
          this.appLog("[AudioContextService Init] New context is suspended. Attempting resume...", true);
          await newContext.resume();
          contextJustResumed = true;
          this.appLog(`[AudioContextService Init] Resume attempt finished. New context state: ${newContext.state}.`, true);
        }
      } catch (creationError) {
        const msg = `Critical Error initializing new AudioContext: ${(creationError as Error).message}`;
        this.appLog(`[AudioContextService Init Critical Error] ${msg}`, true);
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
      this.appLog("[AudioContextService] Suspending AudioContext.", true);
      await this.context.suspend();
      this.appLog(`[AudioContextService] AudioContext suspended. State: ${this.context.state}`, true);
    } else {
      this.appLog("[AudioContextService] AudioContext not running or not initialized, cannot suspend.", true);
    }
  }

  public async resumeContext(): Promise<void> {
    if (this.context && this.context.state === 'suspended') {
      this.appLog("[AudioContextService] Resuming AudioContext.", true);
      await this.context.resume();
      this.appLog(`[AudioContextService] AudioContext resumed. State: ${this.context.state}`, true);
    } else {
      this.appLog("[AudioContextService] AudioContext not suspended or not initialized, cannot resume.", true);
    }
  }

  public getSampleRate(): number | null {
    return this.context?.sampleRate || null;
  }

  public async cleanupContext(): Promise<void> {
    this.appLog("[AudioContextService] Cleaning up AudioContext.", true);
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
                this.appLog("[AudioContextService] AudioContext closed.", true);
            } catch (e) {
                this.appLog(`[AudioContextService] Error closing AudioContext: ${(e as Error).message}`, true);
            }
        }
        this.setContext(null);
    }
  }
}
