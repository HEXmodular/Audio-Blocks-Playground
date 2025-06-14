/**
 * This module provides essential utility functions for data decoding and audio processing within the application.
 * It includes a `decode` function for converting base64 encoded strings into `Uint8Array` byte streams, commonly used for handling binary data received from servers.
 * Another key utility is `decodeAudioData`, which wraps the Web Audio API's `audioContext.decodeAudioData` method in a promise, simplifying the asynchronous conversion of raw audio data (in `ArrayBuffer` or `Uint8Array` format) into playable `AudioBuffer` objects.
 * The `decodeAudioData` function also includes basic checks and warnings if the decoded audio's properties (like sample rate or channel count) don't match expected targets.
 * These utilities are foundational for services that handle encoded audio or binary data, such as the `LiveMusicService`.
 */

// Base64 decoding utility
export function decode(base64String: string): Uint8Array
{
  try {
    const binaryString = window.atob(base64String);
    return Uint8Array.from(binaryString, char => char.charCodeAt(0));
  } catch (e) {
    console.error("Failed to decode base64 string:", e);
    return new Uint8Array(0); // Return empty array on error
  }
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const buffer = ctx.createBuffer(
    numChannels,
    data.length / 2 / numChannels,
    sampleRate,
  );

  const invDivisor = 1 / 32768.0;
  const dataInt16 = new Int16Array(data.buffer);
  const dataFloat32 = Float32Array.from(dataInt16, val => val * invDivisor) //new Float32Array(l);

  // Extract interleaved channels
  if (numChannels === 0) {
    buffer.copyToChannel(dataFloat32, 0);
  } else {
    let channelsData = Array.from({ length: numChannels }, () => new Float32Array(dataFloat32.length / numChannels));

    for (let i = 0; i < dataFloat32.length; i++) {
      const channelIndex = i % numChannels;
      const bufferIndex = Math.floor(i / numChannels);
      channelsData[channelIndex][bufferIndex] = dataFloat32[i];
    }

    for (let i = 0; i < numChannels; i++) {
      buffer.copyToChannel(channelsData[i], i);
    }
  }

  return buffer;
}
