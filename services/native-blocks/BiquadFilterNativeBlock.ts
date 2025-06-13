import { BlockDefinition, BlockParameter, ManagedNativeNodeInfo } from '@interfaces/common'; // Updated import
import { createParameterDefinitions } from '../../constants/constants'; // Adjust path as needed
import { CreatableNode } from './CreatableNode';

// BiquadFilterType is a global type from Web Audio API, no local re-definition needed.

export class BiquadFilterNativeBlock implements CreatableNode {
    private context: AudioContext;

    static getDefinition(): BlockDefinition {
      return {
        id: 'native-biquad-filter-v1',
        name: 'Biquad Filter (Native)',
        description: 'A standard Web Audio API BiquadFilterNode. Parameters control the underlying native node. Audio path is managed by Web Audio graph connections.',
        runsAtAudioRate: true,
        inputs: [
          { id: 'audio_in', name: 'Audio Input', type: 'audio', description: 'Connects to native BiquadFilterNode input in Web Audio graph.' },
          { id: 'freq_cv_in', name: 'Freq CV', type: 'audio', description: 'Modulates frequency AudioParam directly in Web Audio graph.', audioParamTarget: 'frequency'},
          { id: 'q_cv_in', name: 'Q CV', type: 'audio', description: 'Modulates Q AudioParam directly in Web Audio graph.', audioParamTarget: 'Q'}
        ],
        outputs: [
          { id: 'audio_out', name: 'Audio Output', type: 'audio', description: 'Output from native BiquadFilterNode in Web Audio graph.' }
        ],
        parameters: createParameterDefinitions([
          { id: 'frequency', name: 'Frequency', type: 'slider', min: 20, max: 20000, step: 1, defaultValue: 350, description: 'Filter cutoff/center frequency in Hz (AudioParam).', isFrequency: true },
          { id: 'q', name: 'Q Factor', type: 'slider', min: 0.0001, max: 1000, step: 0.0001, defaultValue: 1, description: 'Quality factor, controlling bandwidth (AudioParam).' },
          { id: 'gain', name: 'Gain (dB)', type: 'slider', min: -40, max: 40, step: 0.1, defaultValue: 0, description: 'Gain in decibels, for Peaking, Lowshelf, Highshelf (AudioParam).' },
          {
            id: 'type',
            name: 'Filter Type',
            type: 'select',
            options: [
              {value: "lowpass", label: "Lowpass"}, {value: "highpass", label: "Highpass"},
              {value: "bandpass", label: "Bandpass"}, {value: "notch", label: "Notch"},
              {value: "allpass", label: "Allpass"}, {value: "peaking", label: "Peaking"},
              {value: "lowshelf", label: "Lowshelf"}, {value: "highshelf", label: "Highshelf"}
            ],
            defaultValue: "lowpass",
            description: 'The type of filtering algorithm (native node property).'
          },
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
        initialParams: BlockParameter[]
    ): ManagedNativeNodeInfo {
        if (!this.context) throw new Error("AudioContext not initialized");
        const filterNode = this.context.createBiquadFilter();

        const paramTargetsForCv = new Map<string, AudioParam>();
        paramTargetsForCv.set('frequency', filterNode.frequency);
        paramTargetsForCv.set('Q', filterNode.Q);
        paramTargetsForCv.set('gain', filterNode.gain);

        // Apply initial parameters
        initialParams.forEach(param => {
            switch (param.id) {
                case 'frequency': filterNode.frequency.value = Number(param.currentValue); break;
                case 'q': filterNode.Q.value = Number(param.currentValue); break;
                case 'gain': filterNode.gain.value = Number(param.currentValue); break;
                case 'type': filterNode.type = param.currentValue as BiquadFilterType; break;
            }
        });

        return {
            node: filterNode, // The BiquadFilterNode itself is the main node
            nodeForInputConnections: filterNode,
            nodeForOutputConnections: filterNode,
            mainProcessingNode: filterNode,
            paramTargetsForCv,
            definition,
            instanceId,
        };
    }

    updateNodeParams(
        nodeInfo: ManagedNativeNodeInfo,
        parameters: BlockParameter[]
    ): void {
        if (!this.context || !(nodeInfo.mainProcessingNode instanceof BiquadFilterNode)) return;
        const filterNode = nodeInfo.mainProcessingNode;

        parameters.forEach(param => {
            if (param.id === 'frequency' && filterNode.frequency) {
                filterNode.frequency.setTargetAtTime(Number(param.currentValue), this.context!.currentTime, 0.01);
            } else if (param.id === 'q' && filterNode.Q) {
                filterNode.Q.setTargetAtTime(Number(param.currentValue), this.context!.currentTime, 0.01);
            } else if (param.id === 'gain' && filterNode.gain) {
                filterNode.gain.setTargetAtTime(Number(param.currentValue), this.context!.currentTime, 0.01);
            } else if (param.id === 'type') {
                filterNode.type = param.currentValue as BiquadFilterType;
            }
        });
    }

    connect(_destination: AudioNode | AudioParam, _outputIndex?: number, _inputIndex?: number): void {
        console.warn(`BiquadFilterNativeBlock.connect called directly on instance. This should be handled by AudioGraphConnectorService.`);
    }

    disconnect(_destination?: AudioNode | AudioParam | number, _output?: number, _input?: number): void {
        console.warn(`BiquadFilterNativeBlock.disconnect called directly on instance. This should be handled by AudioGraphConnectorService or by the manager's removeManagedNativeNode.`);
        // If this main node needs to be disconnected from everything it was connected to:
        // if (this.node && typeof this.node.disconnect === 'function') {
        //    this.node.disconnect();
        // }
    }
}
