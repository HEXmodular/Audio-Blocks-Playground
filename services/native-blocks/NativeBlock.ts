/**
 * NativeBlock is the base class for all native blocks.
 */
export abstract class NativeBlock {
  protected audioContext: AudioContext | null; // Changed to audioContext and allow null

  /**
   * Creates a new NativeBlock.
   * @param context The audio context, can be null.
   */
  constructor(context: AudioContext | null) { // Allow null for context
    this.audioContext = context; // Assign to this.audioContext
  }

  /**
   * Checks if the AudioContext has been initialized for this block.
   * @returns True if the audioContext is not null, false otherwise.
   */
  public isContextInitialized(): boolean {
    return !!this.audioContext;
  }

  /**
   * Connects the native block to the given destination.
   * @param destination The destination to connect to.
   */
  abstract connect(destination: AudioNode): void;

  /**
   * Disconnects the native block from the given destination.
   * @param destination The destination to disconnect from.
   */
  abstract disconnect(destination: AudioNode): void;
}
