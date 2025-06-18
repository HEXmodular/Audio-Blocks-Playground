import * as Tone from 'tone';
import { BlockDefinition, BlockParameter, ManagedNativeNodeInfo as OriginalManagedNativeNodeInfo } from '@interfaces/common';
import { createParameterDefinitions } from '../../constants/constants'; // Adjust path as needed
import { CreatableNode } from './CreatableNode';
// import OscillatorCompactRenderer from './renderers/OscillatorCompactRenderer'; // Removed

// Define BPM_FRACTIONS, assuming it's still relevant for LFOs
const BPM_FRACTIONS = [
  {value: 4, label: '1 Bar (4/4)'}, {value: 2, label: '1/2 Note'}, {value: 1, label: '1/4 Note (Beat)'},
  {value: 0.5, label: '1/8 Note'}, {value: 0.25, label: '1/16 Note'}, {value: 0.125, label: '1/32 Note'},
  {value: 1/3, label: '1/4 Triplet'}, {value: 1/6, label: '1/8 Triplet'}, {value: 1/12, label: '1/16 Triplet'},
  {value: 0.75, label: 'Dotted 1/8 Note'}, {value: 1.5, label: 'Dotted 1/4 Note'}
].sort((a, b) => b.value - a.value);


// Extend ManagedNativeNodeInfo to include Tone.js specific nodes
export interface ManagedOscillatorNodeInfo extends OriginalManagedNativeNodeInfo {
  toneOscillator?: Tone.Oscillator;
  toneGain?: Tone.Gain; // For output gain control
  // We might not need mainProcessingNode, internalGainNode if we use toneOscillator and toneGain
}

export class OscillatorNativeBlock implements CreatableNode {
    // Context is now implicitly Tone.getContext() if AudioContextService is used,
    // or we can pass it in if needed for specific scenarios.
    // For now, assume global Tone.js context is managed by AudioContextService.
    // private context: Tone.Context | null = null; // Not storing context directly if using global

    static getOscillatorDefinition(): BlockDefinition {
      return {
        id: 'tone-oscillator-v1', // Changed ID
        name: 'Oscillator (Tone)', // Changed name
        description: 'Generates a basic waveform using a Tone.Oscillator and a Tone.Gain for amplitude.',
        runsAtAudioRate: true,
        inputs: [
          // For Tone.js, CV inputs connect to Tone.Signal parameters
          { id: 'freq_in', name: 'Frequency CV', type: 'audio', description: 'Modulates Oscillator frequency (Tone.Signal).', audioParamTarget: 'frequency' },
          { id: 'gain_cv_in', name: 'Gain CV', type: 'audio', description: 'Modulates output gain (Tone.Signal).', audioParamTarget: 'gain' }
        ],
        outputs: [
          { id: 'audio_out', name: 'Audio Output', type: 'audio', description: 'The generated audio signal (from Tone.Gain).' }
        ],
        parameters: createParameterDefinitions([
          { id: 'frequency', name: 'Frequency', type: 'slider', min: 20, max: 5000, step: 1, defaultValue: 440, description: 'Base frequency in Hz (Tone.Oscillator.frequency).', isFrequency: true },
          { id: 'waveform', name: 'Waveform', type: 'select',
            options: [ // Tone.js specific types
              {value: 'sine', label: 'Sine'}, {value: 'square', label: 'Square'},
              {value: 'sawtooth', label: 'Sawtooth'}, {value: 'triangle', label: 'Triangle'},
              {value: 'pwm', label: 'PWM'}, {value: 'pulse', label: 'Pulse'}, // PWM and Pulse might need extra params like modulationFrequency or width
              // {value: 'fatsine', label: 'Fat Sine'}, {value: 'fatsquare', label: 'Fat Square'}, // Fat oscillators have more params
              // {value: 'fatsawtooth', label: 'Fat Sawtooth'}, {value: 'fattriangle', label: 'Fat Triangle'},
              // {value: 'amcustom', label: 'AM Custom'}, // Custom requires partials
            ],
            defaultValue: 'sine', description: 'Shape of the waveform (Tone.Oscillator.type).' },
          { id: 'detune', name: 'Detune', type: 'slider', min: -1200, max: 1200, step: 1, defaultValue: 0, description: 'Detune in cents (Tone.Oscillator.detune).' },
          { id: 'gain', name: 'Gain', type: 'slider', min: 0, max: 1, step: 0.01, defaultValue: 0.5, description: 'Output gain (0 to 1, controls Tone.Gain).' }
        ]),
        logicCode: "", // No custom logic code for this native block
        compactRendererId: 'oscillator', // Assuming a generic renderer can be adapted
      };
    }

    static getLfoDefinition(): BlockDefinition {
      return {
        id: 'tone-lfo-v1', // Changed ID
        name: 'LFO (Tone)', // Changed name
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
            options: [ // Tone.js specific types suitable for LFO
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
      // For BPM sync, frequency is derived. Users pick a BPM fraction.
      return {
        id: 'tone-lfo-bpm-sync-v1', // Changed ID
        name: 'LFO (BPM Sync, Tone)', // Changed name
        description: 'LFO synchronized to global BPM using Tone.js. Frequency derived from BPM and fraction.',
        runsAtAudioRate: true,
        inputs: [
           { id: 'gain_cv_in', name: 'Gain CV', type: 'audio', description: 'Modulates LFO amplitude.', audioParamTarget: 'gain'}
        ], // Frequency is BPM-derived, so no direct CV for freq
        outputs: [
          { id: 'audio_out', name: 'LFO Output', type: 'audio', description: 'The BPM-synced LFO signal.' }
        ],
        parameters: createParameterDefinitions([
          { id: 'bpm_fraction', name: 'BPM Fraction', type: 'select', options: BPM_FRACTIONS, defaultValue: 1, description: 'LFO rate as a fraction of the global BPM.' },
          { id: 'waveform', name: 'Waveform', type: 'select',
            options: [ // Tone.js specific types suitable for LFO
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

    constructor() {
        // Context is assumed to be managed globally by AudioContextService
        // and accessed via Tone.getContext() when needed.
        // No specific context passed to constructor for now.
    }

    // This method might not be needed if context is always global Tone.getContext()
    setAudioContext(_context: Tone.Context | null): void {
        // if (context) {
        //     this.context = context;
        // } else {
        //     this.context = null;
        // }
    }

    createNode(
        instanceId: string,
        definition: BlockDefinition,
        initialParams: BlockParameter[],
        currentBpm?: number
    ): ManagedOscillatorNodeInfo {
        // Ensure Tone.js context is started (usually by a user interaction via AudioContextService)
        if (Tone.getContext().state !== 'running') {
            console.warn('Tone.js context is not running. Oscillator may not produce sound until context is started.');
            // Consider throwing an error or having a fallback mechanism
        }

        const toneOscillator = new Tone.Oscillator();
        const toneGain = new Tone.Gain(); // For output gain control

        toneOscillator.connect(toneGain);
        toneOscillator.start(); // Start the oscillator immediately

        const paramTargetsForCv = new Map<string, Tone.Param | Tone.Signal<any>>();
        // Map CV input IDs to Tone.js Params/Signals
        // 'frequency' CV input will connect to toneOscillator.frequency
        // 'gain' CV input will connect to toneGain.gain
        paramTargetsForCv.set('frequency', toneOscillator.frequency);
        paramTargetsForCv.set('gain', toneGain.gain);
        // Note: Detune is also a signal, if a CV for detune is added:
        // paramTargetsForCv.set('detune', toneOscillator.detune);


        // Apply initial parameters
        this.updateNodeParams(
            {
                definition,
                instanceId,
                toneOscillator,
                toneGain,
                paramTargetsForCv,
                // The following are from OriginalManagedNativeNodeInfo, may not all be relevant
                node: undefined, // No single "main" native node in the old sense
                nodeForInputConnections: undefined, // Connections are made to Tone.js objects directly
                nodeForOutputConnections: toneGain, // Output is from toneGain
            } as ManagedOscillatorNodeInfo, // Type assertion
            initialParams,
            {}, // No currentInputs initially
            currentBpm
        );

        return {
            // Store Tone.js nodes
            toneOscillator,
            toneGain,
            // Compatibility with how graph connector might expect a single output node
            nodeForOutputConnections: toneGain,
            // CV targets
            paramTargetsForCv,
            // Base properties
            definition,
            instanceId,
            // Deprecated/unused from OriginalManagedNativeNodeInfo for this Tone.js block:
            node: undefined,
            nodeForInputConnections: undefined,
            mainProcessingNode: undefined,
            internalGainNode: undefined,
        };
    }

    updateNodeParams(
        nodeInfo: ManagedOscillatorNodeInfo,
        parameters: BlockParameter[],
        _currentInputs?: Record<string, any>, // CV inputs are handled by connections to Signals
        currentBpm?: number
    ): void {
        if (!nodeInfo.toneOscillator || !nodeInfo.toneGain) {
            console.warn('Tone.js nodes not found in nodeInfo for OscillatorNativeBlock', nodeInfo);
            return;
        }

        const { toneOscillator, toneGain } = nodeInfo;
        const context = Tone.getContext(); // Get current Tone.js context for time-based changes

        const freqParam = parameters.find(p => p.id === 'frequency');
        const waveformParam = parameters.find(p => p.id === 'waveform');
        const gainParam = parameters.find(p => p.id === 'gain');
        const detuneParam = parameters.find(p => p.id === 'detune');
        const bpmFractionParam = parameters.find(p => p.id === 'bpm_fraction'); // Corrected ID

        if (nodeInfo.definition.id === 'tone-lfo-bpm-sync-v1' && bpmFractionParam && currentBpm) {
            const bpmFractionValue = parseFloat(bpmFractionParam.currentValue as string);
            // const beatsPerStep = bpmFractionValue; // This interpretation might be off
            // If bpm_fraction is e.g. 4 for "1 Bar (4/4)", and currentBpm is 120:
            // 1 beat = 0.5s. 1 bar (4 beats) = 2s. Frequency = 1/2s = 0.5 Hz.
            // If bpm_fraction is 1 for "1/4 Note (Beat)": Frequency = 1 / 0.5s = 2 Hz.
            // So, frequency = currentBpm / (60 * bpmFractionValue) if bpmFractionValue means 'number of beats for one LFO cycle'
            // Or, if bpmFractionValue is 'fraction of a beat': freq = (currentBpm / 60) * bpmFractionValue
            // The previous native code: beatsPerStep = bpmFraction; secondsPerBeat = 60/bpm; secPerStep = secPerBeat * beatsPerStep; freq = 1/secPerStep
            // This means freq = 1 / ( (60/bpm) * bpmFractionValue ) = bpm / (60 * bpmFractionValue)
            // Let's use the existing BPM_FRACTIONS values directly as "multiplier for beat frequency"
            // Example: currentBpm = 120 (2 beats/sec). bpm_fraction = 1 (1/4 note). LFO Freq = 2 Hz.
            // bpm_fraction = 0.5 (1/8 note). LFO Freq = 4 Hz.
            // bpm_fraction = 2 (1/2 note). LFO Freq = 1 Hz.
            // So, freq = (currentBpm / 60) / bpmFractionValue
            const calculatedFreq = (currentBpm / 60) / bpmFractionValue;

            const targetFreq = Math.min(200, Math.max(0.01, calculatedFreq)); // LFO Clamp
            // toneOscillator.frequency.value = targetFreq; // Immediate change
            toneOscillator.frequency.setTargetAtTime(targetFreq, context.currentTime, 0.01);

        } else if (freqParam && toneOscillator.frequency) {
            const maxFreq = nodeInfo.definition.id.includes('-lfo-') ? 200 : 5000; // Max from definition
            const targetFreq = Math.min(maxFreq, Math.max(0.01, Number(freqParam.currentValue)));
            // toneOscillator.frequency.value = targetFreq; // Immediate change
            toneOscillator.frequency.setTargetAtTime(targetFreq, context.currentTime, 0.01);
        }

        if (detuneParam && toneOscillator.detune) {
            // toneOscillator.detune.value = Number(detuneParam.currentValue);
            toneOscillator.detune.setTargetAtTime(Number(detuneParam.currentValue), context.currentTime, 0.01);
        }

        if (waveformParam && toneOscillator.type !== waveformParam.currentValue as Tone.ToneOscillatorType) {
             // Check if type is valid for Tone.Oscillator basic types
            const validType = waveformParam.currentValue as Tone.ToneOscillatorType;
            // Add checks for complex types like 'pwm' or 'pulse' which might need more params
            if (['sine', 'square', 'sawtooth', 'triangle', 'pwm', 'pulse'].includes(validType)) {
                 toneOscillator.type = validType;
            } else {
                console.warn(`Unsupported waveform type for Tone.Oscillator: ${validType}. Defaulting to sine.`);
                toneOscillator.type = 'sine';
            }
        }

        if (gainParam && toneGain.gain) {
            // Assuming gainParam.currentValue is linear 0-1 as per new definition
            // toneGain.gain.value = Number(gainParam.currentValue);
            toneGain.gain.setTargetAtTime(Number(gainParam.currentValue), context.currentTime, 0.01);
        }
    }


    // connect and disconnect methods are primarily handled by AudioGraphConnectorService.
    // These might be called by the manager for cleanup or specific scenarios.
    // For Tone.js, ensure disposal of Tone objects if the block instance is truly destroyed.

    dispose(nodeInfo: ManagedOscillatorNodeInfo): void {
        if (nodeInfo.toneOscillator) {
            nodeInfo.toneOscillator.dispose();
        }
        if (nodeInfo.toneGain) {
            nodeInfo.toneGain.dispose();
        }
        console.log(`Disposed Tone.js nodes for instanceId: ${nodeInfo.instanceId}`);
    }

    connect(_destination: Tone.ToneAudioNode | AudioParam, _outputIndex?: number, _inputIndex?: number): void {
        // This method is more of a notification or for specific direct connections if ever needed.
        // The actual graph connections are managed by AudioGraphConnectorService by interacting
        // with nodeInfo.nodeForOutputConnections and nodeInfo.paramTargetsForCv.
        console.warn(`OscillatorNativeBlock.connect called. Connections typically managed by AudioGraphConnectorService.`);
    }

    disconnect(_destination?: Tone.ToneAudioNode | AudioParam | number, _output?: number, _input?: number): void {
        console.warn(`OscillatorNativeBlock.disconnect called. Connections typically managed by AudioGraphConnectorService.`);
    }
}
