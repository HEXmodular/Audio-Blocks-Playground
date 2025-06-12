import { BlockDefinition, BlockParameter, ManagedNativeNodeInfo } from '@interfaces/common'; // Updated import
import { CreatableNode } from './CreatableNode';

export class OscillatorNativeBlock implements CreatableNode {
    private context: AudioContext;

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
