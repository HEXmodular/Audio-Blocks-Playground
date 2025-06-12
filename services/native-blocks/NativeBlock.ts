/**
 * NativeBlock is the base class for all native blocks.
 */
export abstract class NativeBlock {
  protected context: AudioContext;

  /**
   * Creates a new NativeBlock.
   * @param context The audio context.
   */
  constructor(context: AudioContext) {
    this.context = context;
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
