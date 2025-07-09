import { Emitter, getTransport, Oscillator, ToneOscillatorType } from 'tone';
import { BlockDefinition, BlockInstance, NativeBlock } from '@interfaces/block';
import { createParameterDefinitions } from '@constants/constants';


const BLOCK_DEFINITION: BlockDefinition = {
  id: 'tone-oscillator-v1',
  name: 'Oscillator',
  description: 'Generates a basic waveform using.',
  category: 'oscillator',
  inputs: [
    { id: 'frequency', name: 'Frequency CV', type: 'audio', description: 'Modulates Oscillator frequency.' },
    { id: 'frequency_string', name: 'Frequency String', type: 'string', description: 'Modulates Oscillator frequency.' },
    { id: 'volume', name: 'Gain CV', type: 'audio', description: 'Modulates output gain.' },
    { id: 'detune', name: 'Detune CV', type: 'audio', description: 'Modulates Oscillator detune.' }
  ],
  outputs: [
    { id: 'audio_out', name: 'Audio Output', type: 'audio', description: 'The generated audio signal.' }
  ],
  parameters: createParameterDefinitions([
    {
      id: 'frequency', name: 'Frequency', type: 'slider',
      toneParam: { minValue: 20, maxValue: 5000, units: 'frequency' }, // Tone.Param options
      defaultValue: 440, description: 'Base frequency in Hz.', isFrequency: true
    },
    {
      id: 'waveform', name: 'Waveform', type: 'select',
      options: [
        { value: 'sine', label: 'Sine' }, { value: 'square', label: 'Square' },
        { value: 'sawtooth', label: 'Sawtooth' }, { value: 'triangle', label: 'Triangle' },
        { value: 'pwm', label: 'PWM' }, { value: 'pulse', label: 'Pulse' },
      ],
      defaultValue: 'sine', description: 'Shape of the waveform.'
    },
    {
      id: 'detune', name: 'Detune', type: 'slider',
      toneParam: { minValue: -1200, maxValue: 1200, units: 'cents' },
      defaultValue: 0, description: 'Detune in cents.'
    },
    {
      id: 'volume', name: 'Volume', type: 'slider',
      toneParam: { minValue: 0, maxValue: 1, units: 'cents' },
      step: 0.01, defaultValue: 1,
      description: 'Output gain'
    }
  ]),
  compactRendererId: 'oscillator',
};

export class OscillatorBlock extends Oscillator implements NativeBlock {
  readonly name: string = BLOCK_DEFINITION.name;
  private _emitter = new Emitter();

  // input автоматически заполняет сам Tone.js
  // output автоматически заполняет сам Tone.js

  constructor() {
    super();

    getTransport().on('stop', () => {
      this.stop();
    })
    getTransport().on('start', () => {
      this.start();
    })

    this._emitter.on('frequency_string', (data) => {
      // console.log("[OscillatorBlock] frequency_string event", data);
      this.frequency.value = Number(data);
    })
  }

  public static getDefinition(): BlockDefinition {
    return BLOCK_DEFINITION;
  }

  // для выходящий соединений отправляю
  public on(event: any, callback: (...args: any[]) => void) {
    // console.log("[StepSequencerBlock]--->")
    this._emitter.on(event, callback)
    return this
  };

  // для входящих соединений
  public emit(event: any, ...args: any[]) {
    // console.log("--->[StepSequencerBlock]")
    this._emitter.emit(event, args?.[0])
    return this;
  };

  public updateFromBlockInstance(instance: BlockInstance): void {
    if (!instance?.parameters) {
      console.warn(`[OscillatorBlock updateFromBlockInstance] Invalid or missing parameters for instance ${instance.instanceId}.`);
      return;
    }
    const parameters = instance.parameters;

    const freqParam = parameters.find(p => p.id === 'frequency');
    // const freqStringParam = parameters.find(p => p.id === 'frequency_string');
    const waveformParam = parameters.find(p => p.id === 'waveform');
    const volumeParam = parameters.find(p => p.id === 'volume');
    const detuneParam = parameters.find(p => p.id === 'detune');

    if (freqParam) {
      // console.log("[OscillatorBlock] frequency", freqParam.currentValue);
      this.frequency.value = Number(freqParam.currentValue);
    }

    // if (freqStringParam) {
    //   console.log("[OscillatorBlock] frequency_string", freqStringParam.currentValue);
    //   this.frequency.value = Number(freqStringParam.currentValue);
    // }

    if (waveformParam) {
      const targetType = waveformParam.currentValue as ToneOscillatorType;
      if (['sine', 'square', 'sawtooth', 'triangle', 'pwm', 'pulse'].includes(targetType)) {
        this.type = targetType;
      } else {
        console.warn(`[OscillatorBlock updateFromBlockInstance] Unsupported waveform type: ${targetType}. Defaulting to sine.`);
        this.type = 'sine';
      }
    }

    if (detuneParam) {
      const targetDetune = Number(detuneParam.currentValue);
      this.detune.value = targetDetune; // Directly set the detune value
    }

    if (volumeParam) {
      const targetGain = Number(volumeParam.currentValue);
      this.volume.value = targetGain; // Directly set the volume value
    }

  }

}
