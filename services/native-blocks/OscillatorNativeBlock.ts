import { BlockDefinition, BlockParameter, ManagedNativeNodeInfo } from '@interfaces/common';
import { createParameterDefinitions } from '../../constants/constants'; // Adjust path as needed
import { CreatableNode } from './CreatableNode';
// OscillatorType is a global type from Web Audio API

// Define BPM_FRACTIONS here as it's used by NATIVE_LFO_BPM_SYNC_BLOCK_DEFINITION
const BPM_FRACTIONS = [
  {value: 4, label: '1 Bar (4/4)'}, {value: 2, label: '1/2 Note'}, {value: 1, label: '1/4 Note (Beat)'},
  {value: 0.5, label: '1/8 Note'}, {value: 0.25, label: '1/16 Note'}, {value: 0.125, label: '1/32 Note'},
  {value: 1/3, label: '1/4 Triplet'}, {value: 1/6, label: '1/8 Triplet'}, {value: 1/12, label: '1/16 Triplet'},
  {value: 0.75, label: 'Dotted 1/8 Note'}, {value: 1.5, label: 'Dotted 1/4 Note'}
].sort((a, b) => b.value - a.value); // Sort from longest to shortest duration for UI


export class OscillatorNativeBlock implements CreatableNode {
    private context: AudioContext;

    static getOscillatorDefinition(): BlockDefinition {
      return {
        id: 'native-oscillator-v1',
        name: 'Oscillator (Native)',
        description: 'Generates a basic waveform using a native Web Audio API OscillatorNode and an internal GainNode for amplitude.',
        runsAtAudioRate: true,
        inputs: [
          { id: 'freq_in', name: 'Frequency CV', type: 'audio', description: 'Modulates OscillatorNode.frequency AudioParam directly.', audioParamTarget: 'frequency' },
        ],
        outputs: [
          { id: 'audio_out', name: 'Audio Output', type: 'audio', description: 'The generated audio signal (from internal GainNode).' }
        ],
        parameters: createParameterDefinitions([
          { id: 'frequency', name: 'Frequency', type: 'slider', min: 20, max: 5000, step: 1, defaultValue: 440, description: 'Base frequency in Hz (OscillatorNode.frequency).', isFrequency: true },
          { id: 'waveform', name: 'Waveform', type: 'select', options: [{value: 'sine', label: 'Sine'}, {value: 'square', label: 'Square'}, {value: 'sawtooth', label: 'Sawtooth'}, {value: 'triangle', label: 'Triangle'}], defaultValue: 'sine', description: 'Shape of the waveform (OscillatorNode.type).' },
          { id: 'gain', name: 'Gain/CV Depth', type: 'slider', min: 0, max: 200, step: 0.1, defaultValue: 0.5, description: 'Output amplitude or CV modulation depth. Controls an internal GainNode.' }
        ]),
        logicCode: "",
      };
    }

    static getLfoDefinition(): BlockDefinition {
      return {
        id: 'native-lfo-v1',
        name: 'LFO (Native)',
        description: 'Low-Frequency Oscillator using a native OscillatorNode. Max frequency 200Hz. Outputs an audio-rate signal, typically used for modulation.',
        runsAtAudioRate: true,
        inputs: [
          { id: 'freq_cv_in', name: 'Frequency CV', type: 'audio', description: 'Modulates LFO frequency.', audioParamTarget: 'frequency' },
        ],
        outputs: [
          { id: 'audio_out', name: 'LFO Output', type: 'audio', description: 'The LFO signal.' }
        ],
        parameters: createParameterDefinitions([
          { id: 'frequency', name: 'Frequency (Hz)', type: 'slider', min: 0.01, max: 200, step: 0.01, defaultValue: 1, description: 'LFO frequency in Hz.', isFrequency: true },
          { id: 'waveform', name: 'Waveform', type: 'select', options: [{value: 'sine', label: 'Sine'}, {value: 'square', label: 'Square'}, {value: 'sawtooth', label: 'Sawtooth'}, {value: 'triangle', label: 'Triangle'}], defaultValue: 'sine', description: 'LFO waveform shape.' },
          { id: 'gain', name: 'Amplitude', type: 'slider', min: 0, max: 10, step: 0.1, defaultValue: 1, description: 'Amplitude of the LFO signal (controls internal GainNode).' }
        ]),
        logicCode: "",
      };
    }

    static getLfoBpmSyncDefinition(): BlockDefinition {
      return {
        id: 'native-lfo-bpm-sync-v1',
        name: 'LFO (BPM Sync)',
        description: 'LFO synchronized to global BPM, using a native OscillatorNode. Frequency is derived from BPM and selected fraction.',
        runsAtAudioRate: true,
        inputs: [],
        outputs: [
          { id: 'audio_out', name: 'LFO Output', type: 'audio', description: 'The BPM-synced LFO signal.' }
        ],
        parameters: createParameterDefinitions([
          { id: 'bpm_fraction', name: 'BPM Fraction', type: 'select', options: BPM_FRACTIONS, defaultValue: 1, description: 'LFO rate as a fraction of the global BPM.' },
          { id: 'waveform', name: 'Waveform', type: 'select', options: [{value: 'sine', label: 'Sine'}, {value: 'square', label: 'Square'}, {value: 'sawtooth', label: 'Sawtooth'}, {value: 'triangle', label: 'Triangle'}], defaultValue: 'sine', description: 'LFO waveform shape.' },
          { id: 'gain', name: 'Amplitude', type: 'slider', min: 0, max: 10, step: 0.1, defaultValue: 1, description: 'Amplitude of the LFO signal (controls internal GainNode).' }
        ]),
        logicCode: "",
      };
    }

    constructor(context: AudioContext) {
        this.context = context;
    }

    setAudioContext(context: AudioContext | null): void {
        this.context = context!;
    }

    createNode(
        instanceId: string,
        definition: BlockDefinition,
        initialParams: BlockParameter[],
        currentBpm?: number // Used for LFO BPM Sync variant
    ): ManagedNativeNodeInfo {
        if (!this.context) throw new Error("AudioContext not initialized");

        const oscillatorNode = this.context.createOscillator();
        const gainNode = this.context.createGain(); // Internal gain node for amplitude/CV depth

        oscillatorNode.connect(gainNode);
        oscillatorNode.start();

        const paramTargetsForCv = new Map<string, AudioParam>();
        paramTargetsForCv.set('frequency', oscillatorNode.frequency);
        // If gain were CV controllable on this block type directly:
        // paramTargetsForCv.set('gain', gainNode.gain);


        // Apply initial parameters
        let freqParam = initialParams.find(p => p.id === 'frequency');
        const waveformParam = initialParams.find(p => p.id === 'waveform');
        const gainValueParam = initialParams.find(p => p.id === 'gain'); // For LFO amplitude or direct gain control
        const bpmFractionParam = initialParams.find(p => p.id === 'bpm_fraction_rate');


        if (definition.id === 'native-lfo-bpm-sync-v1' && bpmFractionParam && currentBpm) {
            const bpmFraction = parseFloat(bpmFractionParam.currentValue as string);
            const beatsPerStep = bpmFraction;
            const secondsPerBeat = 60.0 / currentBpm;
            const secondsPerStep = secondsPerBeat * beatsPerStep;
            const calculatedFreq = secondsPerStep > 0 ? 1.0 / secondsPerStep : 0;
            oscillatorNode.frequency.value = Math.min(200, Math.max(0.01, calculatedFreq)); // LFO Clamp
        } else if (freqParam) {
             const maxFreq = definition.id.includes('-lfo-') ? 200 : 20000; // Max 200Hz for LFOs
            oscillatorNode.frequency.value = Math.min(maxFreq, Math.max(0.01, Number(freqParam.currentValue)));
        }

        if (waveformParam) {
            oscillatorNode.type = waveformParam.currentValue as OscillatorType;
        }
        if (gainValueParam) {
            gainNode.gain.value = Number(gainValueParam.currentValue);
        } else {
            // Default gain if not specified (e.g. for regular oscillator if gain param is missing)
            gainNode.gain.value = 0.5;
        }

        return {
            node: oscillatorNode, // The OscillatorNode is the main source
            nodeForInputConnections: oscillatorNode, // Not typical, but for consistency if direct connections were allowed
            nodeForOutputConnections: gainNode,   // Output is from the internal gain node
            mainProcessingNode: oscillatorNode,
            internalGainNode: gainNode,
            paramTargetsForCv,
            definition,
            instanceId,
        };
    }

    updateNodeParams(
        nodeInfo: ManagedNativeNodeInfo,
        parameters: BlockParameter[],
        _currentInputs?: Record<string, any>,
        currentBpm?: number
    ): void {
        if (!this.context || !(nodeInfo.mainProcessingNode instanceof OscillatorNode) || !nodeInfo.internalGainNode) return;

        const oscillatorNode = nodeInfo.mainProcessingNode;
        const gainNode = nodeInfo.internalGainNode;

        const freqParam = parameters.find(p => p.id === 'frequency');
        const waveformParam = parameters.find(p => p.id === 'waveform');
        const gainValueParam = parameters.find(p => p.id === 'gain');
        const bpmFractionParam = parameters.find(p => p.id === 'bpm_fraction_rate');

        if (nodeInfo.definition.id === 'native-lfo-bpm-sync-v1' && bpmFractionParam && currentBpm) {
            const bpmFraction = parseFloat(bpmFractionParam.currentValue as string);
            const beatsPerStep = bpmFraction;
            const secondsPerBeat = 60.0 / currentBpm;
            const secondsPerStep = secondsPerBeat * beatsPerStep;
            const calculatedFreq = secondsPerStep > 0 ? 1.0 / secondsPerStep : 0;
            const targetFreq = Math.min(200, Math.max(0.01, calculatedFreq)); // LFO Clamp
            if (oscillatorNode.frequency.value !== targetFreq) { // Avoid unnecessary updates if BPM hasn't effectively changed rate
                 oscillatorNode.frequency.setTargetAtTime(targetFreq, this.context.currentTime, 0.01);
            }
        } else if (freqParam && oscillatorNode.frequency) {
            const maxFreq = nodeInfo.definition.id.includes('-lfo-') ? 200 : 20000;
            const targetFreq = Math.min(maxFreq, Math.max(0.01, Number(freqParam.currentValue)));
            oscillatorNode.frequency.setTargetAtTime(targetFreq, this.context.currentTime, 0.01);
        }

        if (waveformParam) {
            oscillatorNode.type = waveformParam.currentValue as OscillatorType;
        }
        if (gainValueParam && gainNode.gain) {
            gainNode.gain.setTargetAtTime(Number(gainValueParam.currentValue), this.context.currentTime, 0.01);
        }
    }

    connect(_destination: AudioNode | AudioParam, _outputIndex?: number, _inputIndex?: number): void {
        console.warn(`OscillatorNativeBlock.connect called directly. Connections handled by AudioGraphConnectorService.`);
    }

    disconnect(_destination?: AudioNode | AudioParam | number, _output?: number, _input?: number): void {
        console.warn(`OscillatorNativeBlock.disconnect called directly. Connections handled by AudioGraphConnectorService/manager.`);
    }
}
