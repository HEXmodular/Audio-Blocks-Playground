
import { BlockInstance, Connection, BlockParameter } from '@interfaces/common';
import { AudioEngineService } from '@services/AudioEngineService';

export interface VerifyAudioPathHealthOptions {
  oscillatorInstanceId: string;
  audioOutInstanceId: string;
  audioEngine: AudioEngineService;
  blockInstances: BlockInstance[];
  connections: Connection[];
  timeoutMs?: number; // Optional timeout for waiting for samples
}

/**
 * Verifies the health of a specific audio path from an oscillator to an audio output.
 * Throws an error if pre-conditions are not met or if the audio path appears silent.
 *
 * @param options - Configuration for the health check.
 * @throws Error if audio system is not enabled, instances are not found,
 * connection is missing, oscillator gain is zero, or audio path is silent.
 */
export async function verifyAudioPathHealth(options: VerifyAudioPathHealthOptions): Promise<void> {
  const {
    oscillatorInstanceId,
    audioOutInstanceId,
    audioEngine,
    blockInstances,
    connections,
    timeoutMs = 2000, // Default timeout for sample request
  } = options;

  // Pre-check 1: Audio System Enabled
  if (!audioEngine.isAudioGloballyEnabled || !audioEngine.audioContext || audioEngine.audioContext.state !== 'running') {
    throw new Error('[AudioHealthCheck] Audio system is not globally enabled and running.');
  }

  // Pre-check 2: Instances Exist
  const oscillatorInstance = blockInstances.find(b => b.instanceId === oscillatorInstanceId);
  const audioOutInstance = blockInstances.find(b => b.instanceId === audioOutInstanceId);

  if (!oscillatorInstance) {
    throw new Error(`[AudioHealthCheck] Oscillator instance with ID '${oscillatorInstanceId}' not found.`);
  }
  if (!audioOutInstance) {
    throw new Error(`[AudioHealthCheck] AudioOutput instance with ID '${audioOutInstanceId}' not found.`);
  }

  // Pre-check 3: Connection Exists
  // Assuming standard port IDs 'audio_out' for oscillator and 'audio_in' for audio output
  const expectedConnection = connections.find(
    c =>
      c.fromInstanceId === oscillatorInstance.instanceId &&
      c.fromOutputId === 'audio_out' && // Standard oscillator output port ID
      c.toInstanceId === audioOutInstance.instanceId &&
      c.toInputId === 'audio_in' // Standard audio output input port ID
  );

  if (!expectedConnection) {
    throw new Error(
      `[AudioHealthCheck] No direct audio connection found from '${oscillatorInstance.name}' (audio_out) to '${audioOutInstance.name}' (audio_in).`
    );
  }

  // Pre-check 4: Oscillator Gain
  const gainParam = oscillatorInstance.parameters.find((p: BlockParameter) => p.id === 'gain');
  if (!gainParam || parseFloat(gainParam.currentValue as string) <= 0) {
    throw new Error(
      `[AudioHealthCheck] Oscillator '${oscillatorInstance.name}' gain parameter is zero, not found, or invalid. Current gain value: ${gainParam?.currentValue}`
    );
  }
  const freqParam = oscillatorInstance.parameters.find((p: BlockParameter) => p.id === 'frequency');
   if (!freqParam || parseFloat(freqParam.currentValue as string) <= 0) {
    throw new Error(
      `[AudioHealthCheck] Oscillator '${oscillatorInstance.name}' frequency parameter is zero, not found, or invalid. Current frequency value: ${freqParam?.currentValue}`
    );
  }


  // Request Samples from Audio Output Worklet
  let samples: Float32Array;
  try {
    samples = await audioEngine.requestSamplesFromWorklet(audioOutInstance.instanceId, timeoutMs);
  } catch (error) {
    // Re-throw error from requestSamplesFromWorklet (e.g., timeout, node not found)
    throw new Error(`[AudioHealthCheck] Failed to retrieve samples from '${audioOutInstance.name}': ${(error as Error).message}`);
  }

  // Verify Samples are Not All Zero
  const isSilent = samples.every(sample => Math.abs(sample) < 0.00001); // Using a small epsilon for float comparison

  if (isSilent) {
    throw new Error(
      `[AudioHealthCheck] Audio path appears silent. No significant signal detected at '${audioOutInstance.name}' after ${timeoutMs}ms. Oscillator gain: ${gainParam.currentValue}, Freq: ${freqParam.currentValue}. Samples length: ${samples.length}.`
    );
  }

  // If all checks pass and audio is not silent, the function completes successfully.
  console.log(`[AudioHealthCheck] Audio path from '${oscillatorInstance.name}' to '${audioOutInstance.name}' is active and producing sound.`);
}
