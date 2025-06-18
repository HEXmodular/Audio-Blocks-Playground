import * as Tone from 'tone';
import { BlockDefinition, BlockParameter, ManagedNativeNodeInfo as OriginalManagedNativeNodeInfo } from '@interfaces/common';
// AudioParam is a global type, removed from this import
import { createParameterDefinitions } from '../../constants/constants';
import { CreatableNode } from './CreatableNode';

const BPM_FRACTIONS = [
  {value: 4, label: '1 Bar (4/4)'}, {value: 2, label: '1/2 Note'}, {value: 1, label: '1/4 Note (Beat)'},
  {value: 0.5, label: '1/8 Note'}, {value: 0.25, label: '1/16 Note'}, {value: 0.125, label: '1/32 Note'},
  {value: 1/3, label: '1/4 Triplet'}, {value: 1/6, label: '1/8 Triplet'}, {value: 1/12, label: '1/16 Triplet'},
  {value: 0.75, label: 'Dotted 1/8 Note'}, {value: 1.5, label: 'Dotted 1/4 Note'}
].sort((a, b) => b.value - a.value);

export interface ManagedOscillatorNodeInfo extends OriginalManagedNativeNodeInfo {
  toneOscillator?: Tone.Oscillator;
  toneGain?: Tone.Gain;
}

export class OscillatorNativeBlock implements CreatableNode {
    static getOscillatorDefinition(): BlockDefinition {
      return {
        id: 'tone-oscillator-v1',
        name: 'Oscillator (Tone)',
        description: 'Generates a basic waveform using a Tone.Oscillator and a Tone.Gain for amplitude.',
        runsAtAudioRate: true,
        inputs: [
          { id: 'freq_in', name: 'Frequency CV', type: 'audio', description: 'Modulates Oscillator frequency (Tone.Signal).', audioParamTarget: 'frequency' },
          { id: 'gain_cv_in', name: 'Gain CV', type: 'audio', description: 'Modulates output gain (Tone.Signal).', audioParamTarget: 'gain' }
        ],
        outputs: [
          { id: 'audio_out', name: 'Audio Output', type: 'audio', description: 'The generated audio signal (from Tone.Gain).' }
        ],
        parameters: createParameterDefinitions([
          { id: 'frequency', name: 'Frequency', type: 'slider', min: 20, max: 5000, step: 1, defaultValue: 440, description: 'Base frequency in Hz (Tone.Oscillator.frequency).', isFrequency: true },
          { id: 'waveform', name: 'Waveform', type: 'select',
            options: [
              {value: 'sine', label: 'Sine'}, {value: 'square', label: 'Square'},
              {value: 'sawtooth', label: 'Sawtooth'}, {value: 'triangle', label: 'Triangle'},
              {value: 'pwm', label: 'PWM'}, {value: 'pulse', label: 'Pulse'},
            ],
            defaultValue: 'sine', description: 'Shape of the waveform (Tone.Oscillator.type).' },
          { id: 'detune', name: 'Detune', type: 'slider', min: -1200, max: 1200, step: 1, defaultValue: 0, description: 'Detune in cents (Tone.Oscillator.detune).' },
          { id: 'gain', name: 'Gain', type: 'slider', min: 0, max: 1, step: 0.01, defaultValue: 0.5, description: 'Output gain (0 to 1, controls Tone.Gain).' }
        ]),
        logicCode: "",
        compactRendererId: 'oscillator',
      };
    }

    static getLfoDefinition(): BlockDefinition {
      return {
        id: 'tone-lfo-v1',
        name: 'LFO (Tone)',
        description: 'Low-Frequency Oscillator using Tone.Oscillator. Max frequency 200Hz. Outputs an audio-rate signal for modulation.',
        runsAtAudioRate: true,
        inputs: [
          { id: 'freq_cv_in', name: 'Frequency CV', type: 'audio', description: 'Modulates LFO frequency.', audioParamTarget: 'frequency' },
          { id: 'gain_cv_in', name: 'Gain CV', type: 'audio', description: 'Modulates LFO amplitude.', audioParamTarget: 'gain'}
        ],
        outputs: [
          { id: 'audio_out', name: 'LFO Output', type: 'audio', description: 'The LFO signal.' }
        ],
        parameters: createParameterDefinitions([
          { id: 'frequency', name: 'Frequency (Hz)', type: 'slider', min: 0.01, max: 200, step: 0.01, defaultValue: 1, description: 'LFO frequency in Hz.', isFrequency: true },
          { id: 'waveform', name: 'Waveform', type: 'select',
            options: [
              {value: 'sine', label: 'Sine'}, {value: 'square', label: 'Square'},
              {value: 'sawtooth', label: 'Sawtooth'}, {value: 'triangle', label: 'Triangle'},
            ],
            defaultValue: 'sine', description: 'LFO waveform shape.' },
          { id: 'detune', name: 'Detune', type: 'slider', min: -100, max: 100, step: 1, defaultValue: 0, description: 'LFO detune in cents.' },
          { id: 'gain', name: 'Amplitude', type: 'slider', min: 0, max: 1, step: 0.01, defaultValue: 1, description: 'Amplitude of the LFO signal (0 to 1, controls Tone.Gain).' }
        ]),
        logicCode: "",
        compactRendererId: 'oscillator',
      };
    }

    static getLfoBpmSyncDefinition(): BlockDefinition {
      return {
        id: 'tone-lfo-bpm-sync-v1',
        name: 'LFO (BPM Sync, Tone)',
        description: 'LFO synchronized to global BPM using Tone.js. Frequency derived from BPM and fraction.',
        runsAtAudioRate: true,
        inputs: [
           { id: 'gain_cv_in', name: 'Gain CV', type: 'audio', description: 'Modulates LFO amplitude.', audioParamTarget: 'gain'}
        ],
        outputs: [
          { id: 'audio_out', name: 'LFO Output', type: 'audio', description: 'The BPM-synced LFO signal.' }
        ],
        parameters: createParameterDefinitions([
          { id: 'bpm_fraction', name: 'BPM Fraction', type: 'select', options: BPM_FRACTIONS, defaultValue: 1, description: 'LFO rate as a fraction of the global BPM.' },
          { id: 'waveform', name: 'Waveform', type: 'select',
            options: [
              {value: 'sine', label: 'Sine'}, {value: 'square', label: 'Square'},
              {value: 'sawtooth', label: 'Sawtooth'}, {value: 'triangle', label: 'Triangle'},
            ],
            defaultValue: 'sine', description: 'LFO waveform shape.' },
          { id: 'detune', name: 'Detune (Cents)', type: 'slider', min: -100, max: 100, step: 1, defaultValue: 0, description: 'Fine-tune LFO frequency in cents.' },
          { id: 'gain', name: 'Amplitude', type: 'slider', min: 0, max: 1, step: 0.01, defaultValue: 1, description: 'Amplitude of the LFO signal (0 to 1, controls Tone.Gain).' }
        ]),
        logicCode: "",
        compactRendererId: 'oscillator',
      };
    }

    constructor() {}

    setAudioContext(_context: any): void {}

    createNode(
        instanceId: string,
        definition: BlockDefinition,
        initialParams: BlockParameter[],
        currentBpm?: number
    ): ManagedOscillatorNodeInfo {
        if (Tone.getContext().state !== 'running') {
            console.warn('Tone.js context is not running. Oscillator may not produce sound until context is started.');
        }

        const toneOscillator = new Tone.Oscillator();
        const toneGain = new Tone.Gain();
        toneOscillator.connect(toneGain);
        toneOscillator.start();

        const specificParamTargetsForCv = new Map<string, AudioParam | Tone.Param<any> | Tone.Signal<any>>([
            ['frequency', toneOscillator.frequency],
            ['gain', toneGain.gain as unknown as Tone.Param<any>],
            ['detune', toneOscillator.detune]
        ]);

        const nodeInfo: ManagedOscillatorNodeInfo = {
            definition,
            instanceId,
            toneOscillator,
            toneGain,
            paramTargetsForCv: specificParamTargetsForCv,
            node: toneGain as unknown as Tone.ToneAudioNode,
            nodeForInputConnections: toneOscillator as unknown as Tone.ToneAudioNode,
            nodeForOutputConnections: toneGain as unknown as Tone.ToneAudioNode,
            mainProcessingNode: toneOscillator as unknown as Tone.ToneAudioNode,
            internalGainNode: toneGain as unknown as Tone.Gain,
            allpassInternalNodes: undefined,
            constantSourceValueNode: undefined,
            internalState: {},
        };

        const { toneOscillator: currentToneOscFromInfo, toneGain: currentToneGainFromInfo } = nodeInfo;

        if (currentToneOscFromInfo && currentToneGainFromInfo) {
            const freqParam = initialParams.find(p => p.id === 'frequency');
            const waveformParam = initialParams.find(p => p.id === 'waveform');
            const gainParam = initialParams.find(p => p.id === 'gain');
            const detuneParam = initialParams.find(p => p.id === 'detune');
            const bpmFractionParam = initialParams.find(p => p.id === 'bpm_fraction');

            if (definition.id === 'tone-lfo-bpm-sync-v1' && bpmFractionParam && currentBpm) {
                const bpmFractionValue = parseFloat(bpmFractionParam.currentValue as string);
                const calculatedFreq = (currentBpm / 60) / bpmFractionValue;
                const targetFreq = Math.min(200, Math.max(0.01, calculatedFreq));
                currentToneOscFromInfo.frequency.value = targetFreq;
            } else if (freqParam && currentToneOscFromInfo.frequency) {
                const maxFreq = definition.id.includes('-lfo-') ? 200 : 5000;
                const targetFreq = Math.min(maxFreq, Math.max(0.01, Number(freqParam.currentValue)));
                currentToneOscFromInfo.frequency.value = targetFreq;
            }

            if (detuneParam && currentToneOscFromInfo.detune) {
                currentToneOscFromInfo.detune.value = Number(detuneParam.currentValue);
            }

            if (waveformParam && currentToneOscFromInfo.type !== waveformParam.currentValue as Tone.ToneOscillatorType) {
                const validType = waveformParam.currentValue as Tone.ToneOscillatorType;
                if (['sine', 'square', 'sawtooth', 'triangle', 'pwm', 'pulse'].includes(validType)) {
                    currentToneOscFromInfo.type = validType;
                } else {
                    console.warn(`Unsupported waveform type for Tone.Oscillator: ${validType}. Defaulting to sine.`);
                    currentToneOscFromInfo.type = 'sine';
                }
            }

            if (gainParam && currentToneGainFromInfo.gain) {
                currentToneGainFromInfo.gain.value = Number(gainParam.currentValue);
            }
        }

        return nodeInfo;
    }

    updateNodeParams(
        nodeInfo: ManagedOscillatorNodeInfo,
        parameters: BlockParameter[],
        _currentInputs?: Record<string, any>,
        currentBpm?: number
    ): void {
        if (!nodeInfo.toneOscillator || !nodeInfo.toneGain) {
            console.warn('Tone.js nodes not found in nodeInfo for OscillatorNativeBlock', nodeInfo);
            return;
        }

        const { toneOscillator, toneGain } = nodeInfo;
        const context = Tone.getContext();

        const freqParam = parameters.find(p => p.id === 'frequency');
        const waveformParam = parameters.find(p => p.id === 'waveform');
        const gainParam = parameters.find(p => p.id === 'gain');
        const detuneParam = parameters.find(p => p.id === 'detune');
        const bpmFractionParam = parameters.find(p => p.id === 'bpm_fraction');

        if (nodeInfo.definition.id === 'tone-lfo-bpm-sync-v1' && bpmFractionParam && currentBpm) {
            const bpmFractionValue = parseFloat(bpmFractionParam.currentValue as string);
            const calculatedFreq = (currentBpm / 60) / bpmFractionValue;
            const targetFreq = Math.min(200, Math.max(0.01, calculatedFreq));
            toneOscillator.frequency.setTargetAtTime(targetFreq, context.currentTime, 0.01);
        } else if (freqParam && toneOscillator.frequency) {
            const maxFreq = nodeInfo.definition.id.includes('-lfo-') ? 200 : 5000;
            const targetFreq = Math.min(maxFreq, Math.max(0.01, Number(freqParam.currentValue)));
            toneOscillator.frequency.setTargetAtTime(targetFreq, context.currentTime, 0.01);
        }

        if (detuneParam && toneOscillator.detune) {
            toneOscillator.detune.setTargetAtTime(Number(detuneParam.currentValue), context.currentTime, 0.01);
        }

        if (waveformParam && toneOscillator.type !== waveformParam.currentValue as Tone.ToneOscillatorType) {
            const validType = waveformParam.currentValue as Tone.ToneOscillatorType;
            if (['sine', 'square', 'sawtooth', 'triangle', 'pwm', 'pulse'].includes(validType)) {
                 toneOscillator.type = validType;
            } else {
                console.warn(`Unsupported waveform type for Tone.Oscillator: ${validType}. Defaulting to sine.`);
                toneOscillator.type = 'sine';
            }
        }

        if (gainParam && toneGain.gain) {
            toneGain.gain.setTargetAtTime(Number(gainParam.currentValue), context.currentTime, 0.01);
        }
    }

    dispose(nodeInfo: ManagedOscillatorNodeInfo): void {
        if (nodeInfo.toneOscillator) {
            nodeInfo.toneOscillator.dispose();
        }
        if (nodeInfo.toneGain) {
            nodeInfo.toneGain.dispose();
        }
        console.log(`Disposed Tone.js nodes for instanceId: ${nodeInfo.instanceId}`);
    }

    connect(_destination: any, _outputIndex?: number, _inputIndex?: number): any {
        console.warn(`OscillatorNativeBlock.connect called. Connections typically managed by AudioGraphConnectorService.`);
    }

    disconnect(_destination?: any, _output?: number, _input?: number): void {
        console.warn(`OscillatorNativeBlock.disconnect called. Connections typically managed by AudioGraphConnectorService.`);
    }
}
