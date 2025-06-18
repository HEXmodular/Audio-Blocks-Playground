import * as Tone from 'tone';
import { BlockDefinition, BlockParameter, ManagedNativeNodeInfo as OriginalManagedNativeNodeInfo } from '@interfaces/common';
// AudioParam is a global type, removed from common import
import { createParameterDefinitions } from '../../constants/constants';
import { CreatableNode } from './CreatableNode';

export interface ManagedFilterNodeInfo extends OriginalManagedNativeNodeInfo {
  toneFilter?: Tone.Filter;
}

export class BiquadFilterNativeBlock implements CreatableNode {
    static getDefinition(): BlockDefinition {
      return {
        id: 'tone-filter-v1',
        name: 'Filter (Tone)',
        description: 'A Tone.Filter node, providing various filter types.',
        runsAtAudioRate: true,
        inputs: [
          { id: 'audio_in', name: 'Audio Input', type: 'audio', description: 'Connects to Tone.Filter input.' },
          { id: 'freq_cv_in', name: 'Freq CV', type: 'audio', description: 'Modulates filter frequency (Tone.Signal).', audioParamTarget: 'frequency'},
          { id: 'q_cv_in', name: 'Q CV', type: 'audio', description: 'Modulates filter Q factor (Tone.Param).', audioParamTarget: 'Q'},
          { id: 'gain_cv_in', name: 'Gain CV', type: 'audio', description: 'Modulates filter gain for relevant types (Tone.Param).', audioParamTarget: 'gain'}
        ],
        outputs: [
          { id: 'audio_out', name: 'Audio Output', type: 'audio', description: 'Output from Tone.Filter.' }
        ],
        parameters: createParameterDefinitions([
          { id: 'frequency', name: 'Frequency', type: 'slider', min: 20, max: 20000, step: 1, defaultValue: 350, description: 'Filter cutoff/center frequency in Hz.', isFrequency: true },
          { id: 'q', name: 'Q Factor', type: 'slider', min: 0.0001, max: 100, step: 0.0001, defaultValue: 1, description: 'Quality factor, controlling bandwidth.' },
          { id: 'gain', name: 'Gain (dB)', type: 'slider', min: -40, max: 40, step: 0.1, defaultValue: 0, description: 'Gain in decibels, for Peaking, Lowshelf, Highshelf filters.' },
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
            description: 'The type of filtering algorithm.'
          },
        ]),
        logicCode: "",
      };
    }

    constructor() {}

    setAudioContext(_context: any): void {}

    createNode(
        instanceId: string,
        definition: BlockDefinition,
        initialParams: BlockParameter[]
    ): ManagedFilterNodeInfo {
        if (Tone.getContext().state !== 'running') {
            console.warn('Tone.js context is not running. Filter node may not function correctly until context is started.');
        }

        const initialFrequency = initialParams.find(p => p.id === 'frequency')?.currentValue as number ?? 350;
        const initialType = initialParams.find(p => p.id === 'type')?.currentValue as string ?? "lowpass";
        const toneFilter = new Tone.Filter(initialFrequency, initialType as any, -12);

        const specificParamTargetsForCv = new Map<string, AudioParam | Tone.Param<any> | Tone.Signal<any>>([
            ['frequency', toneFilter.frequency],
            ['Q', toneFilter.Q],
            ['gain', toneFilter.gain as unknown as Tone.Param<any>]
        ]);

        const nodeInfo: ManagedFilterNodeInfo = {
            definition,
            instanceId,
            toneFilter,
            node: toneFilter as unknown as Tone.ToneAudioNode,
            nodeForInputConnections: toneFilter as unknown as Tone.ToneAudioNode,
            nodeForOutputConnections: toneFilter as unknown as Tone.ToneAudioNode,
            mainProcessingNode: toneFilter as unknown as Tone.ToneAudioNode,
            paramTargetsForCv: specificParamTargetsForCv,
            internalGainNode: undefined,
            allpassInternalNodes: undefined,
            constantSourceValueNode: undefined,
            internalState: {},
        };

        this.updateNodeParams(nodeInfo, initialParams);

        return nodeInfo;
    }

    updateNodeParams(
        nodeInfo: ManagedFilterNodeInfo,
        parameters: BlockParameter[],
        _currentInputs?: Record<string, any>,
        _currentBpm?: number
    ): void {
        if (!nodeInfo.toneFilter) {
            console.warn('Tone.Filter node not found in nodeInfo for BiquadFilterNativeBlock', nodeInfo);
            return;
        }
        const currentToneFilter = nodeInfo.toneFilter;
        const context = Tone.getContext();

        parameters.forEach(param => {
            switch (param.id) {
                case 'frequency':
                    currentToneFilter.frequency.setTargetAtTime(Number(param.currentValue), context.currentTime, 0.01);
                    break;
                case 'q':
                    currentToneFilter.Q.setTargetAtTime(Number(param.currentValue), context.currentTime, 0.01);
                    break;
                case 'gain':
                    currentToneFilter.gain.setTargetAtTime(Number(param.currentValue), context.currentTime, 0.01);
                    break;
                case 'type':
                    if (currentToneFilter.type !== param.currentValue as string) {
                        currentToneFilter.type = param.currentValue as any;
                    }
                    break;
            }
        });
    }

    dispose(nodeInfo: ManagedFilterNodeInfo): void {
        if (nodeInfo.toneFilter) {
            nodeInfo.toneFilter.dispose();
            console.log(`Disposed Tone.Filter node for instanceId: ${nodeInfo.instanceId}`);
        }
    }

    connect(_destination: any, _outputIndex?: number, _inputIndex?: number): any {
        console.warn(`BiquadFilterNativeBlock.connect called. Connections typically managed by AudioGraphConnectorService.`);
    }

    disconnect(_destination?: any, _output?: number, _input?: number): void {
        console.warn(`BiquadFilterNativeBlock.disconnect called. Connections typically managed by AudioGraphConnectorService.`);
    }
}
