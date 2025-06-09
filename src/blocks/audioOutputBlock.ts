
import { BlockDefinition } from '../types';
import { createParameterDefinitions } from '../constants';

const SAMPLE_BUFFER_PROCESSOR_NAME = 'sample-buffer-processor';
const SAMPLE_BUFFER_WORKLET_CODE = `
class SampleBufferProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [];
  }

  constructor(options) {
    super(options);
    this.instanceId = options?.processorOptions?.instanceId || 'UnknownSampleBufferWorklet';
    this.recentSamples = new Float32Array(1024); // Store last 1024 samples
    this.recentSamplesWritePtr = 0;

    this.port.onmessage = (event) => {
      if (event.data?.type === 'GET_RECENT_SAMPLES') {
        // To return samples in chronological order (oldest to newest)
        // we create a new array and fill it by reading from the circular buffer.
        const orderedSamples = new Float32Array(this.recentSamples.length);
        let readPtr = this.recentSamplesWritePtr;
        for (let i = 0; i < this.recentSamples.length; i++) {
          orderedSamples[i] = this.recentSamples[readPtr];
          readPtr = (readPtr + 1) % this.recentSamples.length;
        }
        this.port.postMessage({ type: 'RECENT_SAMPLES_DATA', samples: orderedSamples });
      }
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (input && input.length > 0 && output && output.length > 0) {
      const inputChannel = input[0];
      const outputChannel = output[0];
      if (inputChannel && outputChannel) {
        for (let i = 0; i < outputChannel.length; ++i) {
          const sample = inputChannel[i] !== undefined ? inputChannel[i] : 0;
          outputChannel[i] = sample;

          // Store in circular buffer
          this.recentSamples[this.recentSamplesWritePtr] = sample;
          this.recentSamplesWritePtr = (this.recentSamplesWritePtr + 1) % this.recentSamples.length;
        }
      }
    } else if (output && output.length > 0) {
      const outputChannel = output[0];
      if (outputChannel) {
        for (let i = 0; i < outputChannel.length; ++i) {
          outputChannel[i] = 0;
           // Store silence in circular buffer if no input
          this.recentSamples[this.recentSamplesWritePtr] = 0;
          this.recentSamplesWritePtr = (this.recentSamplesWritePtr + 1) % this.recentSamples.length;
        }
      }
    }
    return true;
  }
}
// IMPORTANT: The registerProcessor call will be done by the host environment (useAudioEngine)
`;

export const AUDIO_OUTPUT_BLOCK_DEFINITION: BlockDefinition = {
  id: 'system-audio-output-v1',
  name: 'Audio Output',
  description: 'Plays the incoming audio signal. Contains an internal GainNode for volume control which then feeds a SampleBufferProcessor AudioWorklet (acting as a sink). The input port connects to this internal GainNode.',
  runsAtAudioRate: true,
  inputs: [
    { id: 'audio_in', name: 'Audio Input', type: 'audio', description: 'Signal to play. Connects to the internal volume GainNode.' }
  ],
  outputs: [],
  parameters: createParameterDefinitions([ 
    { id: 'volume', name: 'Volume', type: 'slider', min: 0, max: 1, step: 0.01, defaultValue: 0.7, description: 'Output volume level (controls an internal GainNode AudioParam)' }
  ]),
  logicCode: `
// The 'audio_in' port is connected to this block's internal GainNode by the host audio engine.
// The 'volume' parameter is used by useAudioEngine to control this internal GainNode's gain AudioParam.
// This logicCode itself does not directly interact with the worklet or process audio.
// __custom_block_logger__('Audio Output main-thread: Host manages audio routing and volume for this block.');
return {};
  `.trim(),
  initialPrompt: 'System block: Audio Output. Plays audio from its input. Has a volume parameter that controls an internal GainNode. The GainNode then feeds a SampleBufferProcessor AudioWorklet.',
  audioWorkletProcessorName: SAMPLE_BUFFER_PROCESSOR_NAME,
  audioWorkletCode: SAMPLE_BUFFER_WORKLET_CODE,
};
