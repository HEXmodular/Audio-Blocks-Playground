
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

// Web Audio API's decodeAudioData wrapped in a promise
export async function decodeAudioData(
  audioData: ArrayBuffer | Uint8Array,
  audioContext: AudioContext,
  sampleRate: number, // Target sample rate
  numberOfChannels: number // Target number of channels
): Promise<AudioBuffer> {
  // If input is Uint8Array, we need its underlying ArrayBuffer
  const bufferToDecode = audioData instanceof Uint8Array ? audioData.buffer : audioData;
  
  try {
    const decodedBuffer = await audioContext.decodeAudioData(bufferToDecode);
    
    // Basic check, Lyria service should provide data at correct sampleRate/channels.
    // If not, resampling/rechanneling would be needed here, which is complex.
    // For now, assume it matches.
    if (decodedBuffer.sampleRate !== sampleRate) {
        console.warn(`LiveMusicService: Decoded audio sample rate ${decodedBuffer.sampleRate} does not match target ${sampleRate}. Playback issues may occur.`);
    }
    if (decodedBuffer.numberOfChannels !== numberOfChannels) {
        console.warn(`LiveMusicService: Decoded audio channels ${decodedBuffer.numberOfChannels} does not match target ${numberOfChannels}. Playback issues may occur.`);
    }
    return decodedBuffer;

  } catch (e) {
    console.error("Error decoding audio data:", e);
    // Return a very short silent buffer on error to prevent crashes downstream
    return audioContext.createBuffer(numberOfChannels, 1, sampleRate);
  }
}
