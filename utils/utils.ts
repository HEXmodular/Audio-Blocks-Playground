/**
 * This module provides essential utility functions for data decoding and audio processing within the application.
 * It includes a `decode` function for converting base64 encoded strings into `Uint8Array` byte streams, commonly used for handling binary data received from servers.
 * Another key utility is `decodeAudioData`, which wraps the Web Audio API's `audioContext.decodeAudioData` method in a promise, simplifying the asynchronous conversion of raw audio data (in `ArrayBuffer` or `Uint8Array` format) into playable `AudioBuffer` objects.
 * The `decodeAudioData` function also includes basic checks and warnings if the decoded audio's properties (like sample rate or channel count) don't match expected targets.
 * These utilities are foundational for services that handle encoded audio or binary data, such as the `LiveMusicService`.
 */

// Base64 decoding utility
export function decode(base64String: string): Uint8Array {
  try {
    const binaryString = window.atob(base64String);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
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

  const dataInt16 = new Int16Array(data.buffer);
  const l = dataInt16.length;
  const dataFloat32 = new Float32Array(l);
  for (let i = 0; i < l; i++) {
    dataFloat32[i] = dataInt16[i] / 32768.0;
  }
  // Extract interleaved channels
  if (numChannels === 0) {
    buffer.copyToChannel(dataFloat32, 0);
  } else {
    for (let i = 0; i < numChannels; i++) {
      const channel = dataFloat32.filter(
        (_, index) => index % numChannels === i,
      );
      buffer.copyToChannel(channel, i);
    }
  }

  return buffer;
}
