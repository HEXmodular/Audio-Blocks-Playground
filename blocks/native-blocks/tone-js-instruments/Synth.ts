import { Emitter, Synth } from 'tone';
import { BlockDefinition, BlockInstance, NativeBlock } from '@interfaces/block';
import { createParameterDefinitions } from '@constants/constants';

const BLOCK_DEFINITION: BlockDefinition = {
  id: 'tone-synth-v1',
  name: 'Synth',
  description: 'A basic synthesizer.',
  category: 'instrument',
  inputs: [
        { id: 'note_in', name: 'Note In', type: 'note', description: 'Triggers the synth note.' },

    // { id: 'gate', name: 'Gate', type: 'gate', description: 'Triggers the synth.' },
    // { id: 'frequency', name: 'Frequency', type: 'audio', description: 'Modulates synth frequency.' },
  ],
  outputs: [
    { id: 'audio_out', name: 'Audio Output', type: 'audio', description: 'The generated audio signal.' },
  ],
  parameters: createParameterDefinitions([
    {
      id: 'frequency', name: 'Frequency', type: 'slider',
      toneParam: { minValue: 20, maxValue: 5000, units: 'frequency' },
      defaultValue: 440, description: 'Base frequency in Hz.', isFrequency: true
    },
    {
      id: 'detune', name: 'Detune', type: 'slider',
      toneParam: { minValue: -1200, maxValue: 1200, units: 'cents' },
      defaultValue: 0, description: 'Detune in cents.'
    },
    {
      id: 'portamento', name: 'Portamento', type: 'slider',
      toneParam: { minValue: 0, maxValue: 1, units: 'normalRange' },
      defaultValue: 0, description: 'Portamento between notes.'
    },
    {
      id: 'attack', name: 'Attack', type: 'slider',
      toneParam: { minValue: 0.01, maxValue: 1, units: 'time' },
      defaultValue: 0.01, description: 'Attack time.'
    },
    {
      id: 'decay', name: 'Decay', type: 'slider',
      toneParam: { minValue: 0.01, maxValue: 1, units: 'time' },
      defaultValue: 0.1, description: 'Decay time.'
    },
    {
      id: 'sustain', name: 'Sustain', type: 'slider',
      toneParam: { minValue: 0, maxValue: 1, units: 'normalRange' },
      defaultValue: 0.5, description: 'Sustain level.'
    },
    {
      id: 'release', name: 'Release', type: 'slider',
      toneParam: { minValue: 0.01, maxValue: 5, units: 'time' },
      defaultValue: 1, description: 'Release time.'
    },
    {
      id: 'oscillatorType', name: 'Oscillator Type', type: 'select',
      options: [
        { value: 'sine', label: 'Sine' }, { value: 'square', label: 'Square' },
        { value: 'sawtooth', label: 'Sawtooth' }, { value: 'triangle', label: 'Triangle' },
        { value: 'pwm', label: 'PWM' }, { value: 'pulse', label: 'Pulse' },
      ],
      defaultValue: 'sine', description: 'Shape of the waveform.'
    },
  ]),
};

export class SynthBlock extends Synth implements NativeBlock {
  private _emitter = new Emitter();

  constructor() {
    super();

    this._emitter.on('note_in', (data) => {
      if (data) {
        // this.triggerAttack(this.frequency.value);
        this.triggerAttackRelease(data.note, data.duration, data.time);
      } else {
        this.triggerRelease();
      }
    });
  }

  public static getDefinition(): BlockDefinition {
    return BLOCK_DEFINITION;
  }

  public on(event: any, callback: (...args: any[]) => void) {
    this._emitter.on(event, callback);
    return this;
  }

  public emit(event: any, ...args: any[]) {
    this._emitter.emit(event, args?.[0]);
    return this;
  }

  public updateFromBlockInstance(instance: BlockInstance): void {
    if (!instance?.parameters) {
      return;
    }
    const parameters = instance.parameters;

    const frequency = parameters.find(p => p.id === 'frequency');
    if (frequency) {
      this.frequency.value = Number(frequency.currentValue);
    }

    const detune = parameters.find(p => p.id === 'detune');
    if (detune) {
      this.detune.value = Number(detune.currentValue);
    }

    const portamento = parameters.find(p => p.id === 'portamento');
    if (portamento) {
      this.portamento = Number(portamento.currentValue);
    }

    const attack = parameters.find(p => p.id === 'attack');
    if (attack) {
      this.envelope.attack = Number(attack.currentValue);
    }

    const decay = parameters.find(p => p.id === 'decay');
    if (decay) {
      this.envelope.decay = Number(decay.currentValue);
    }

    const sustain = parameters.find(p => p.id === 'sustain');
    if (sustain) {
      this.envelope.sustain = Number(sustain.currentValue);
    }

    const release = parameters.find(p => p.id === 'release');
    if (release) {
      this.envelope.release = Number(release.currentValue);
    }

    const oscillatorType = parameters.find(p => p.id === 'oscillatorType');
    if (oscillatorType) {
      this.oscillator.type = oscillatorType.currentValue;
    }
  }
}
