import * as Tone from 'tone';
import { BlockDefinition, BlockParameter, ManagedNativeNodeInfo as OriginalManagedNativeNodeInfo } from '@interfaces/common';
import { createParameterDefinitions } from '../../constants/constants';
import { CreatableNode } from './CreatableNode';

// Define a more specific type for the managed node info
export interface ManagedFilterNodeInfo extends OriginalManagedNativeNodeInfo {
  toneFilter?: Tone.Filter;
}

export class BiquadFilterNativeBlock implements CreatableNode {
    // Context is assumed to be managed globally by AudioContextService

    static getDefinition(): BlockDefinition {
      return {
        id: 'tone-filter-v1', // Changed ID
        name: 'Filter (Tone)', // Changed name
        description: 'A Tone.Filter node, providing various filter types.',
        runsAtAudioRate: true,
        inputs: [
          { id: 'audio_in', name: 'Audio Input', type: 'audio', description: 'Connects to Tone.Filter input.' },
          { id: 'freq_cv_in', name: 'Freq CV', type: 'audio', description: 'Modulates filter frequency (Tone.Signal).', audioParamTarget: 'frequency'},
          { id: 'q_cv_in', name: 'Q CV', type: 'audio', description: 'Modulates filter Q factor (Tone.Param).', audioParamTarget: 'Q'}, // Tone.Filter.Q is Param
          { id: 'gain_cv_in', name: 'Gain CV', type: 'audio', description: 'Modulates filter gain for relevant types (Tone.Param).', audioParamTarget: 'gain'}
        ],
        outputs: [
          { id: 'audio_out', name: 'Audio Output', type: 'audio', description: 'Output from Tone.Filter.' }
        ],
        parameters: createParameterDefinitions([
          { id: 'frequency', name: 'Frequency', type: 'slider', min: 20, max: 20000, step: 1, defaultValue: 350, description: 'Filter cutoff/center frequency in Hz.', isFrequency: true },
          { id: 'q', name: 'Q Factor', type: 'slider', min: 0.0001, max: 100, step: 0.0001, defaultValue: 1, description: 'Quality factor, controlling bandwidth.' }, // Max Q for Tone.Filter often practically lower than 1000
          { id: 'gain', name: 'Gain (dB)', type: 'slider', min: -40, max: 40, step: 0.1, defaultValue: 0, description: 'Gain in decibels, for Peaking, Lowshelf, Highshelf filters.' },
          {
            id: 'type',
            name: 'Filter Type',
            type: 'select',
            // Tone.Filter supports these types directly
            options: [
              {value: "lowpass", label: "Lowpass"}, {value: "highpass", label: "Highpass"},
              {value: "bandpass", label: "Bandpass"}, {value: "notch", label: "Notch"},
              {value: "allpass", label: "Allpass"}, {value: "peaking", label: "Peaking"},
              {value: "lowshelf", label: "Lowshelf"}, {value: "highshelf", label: "Highshelf"}
            ],
            defaultValue: "lowpass",
            description: 'The type of filtering algorithm.'
          },
          // Tone.Filter has rolloff, could be an advanced parameter if desired:
          // { id: 'rolloff', name: 'Rolloff (dB/oct)', type: 'select', options: [-12, -24, -48, -96], defaultValue: -12, description: 'Steepness of the filter cutoff.'}
        ]),
        logicCode: "",
      };
    }

    constructor() {
        // Global Tone.context is assumed.
    }

    setAudioContext(_context: Tone.Context | null): void {
        // This method may not be strictly necessary if relying on global Tone.context
    }

    createNode(
        instanceId: string,
        definition: BlockDefinition,
        initialParams: BlockParameter[]
    ): ManagedFilterNodeInfo {
        if (Tone.getContext().state !== 'running') {
            console.warn('Tone.js context is not running. Filter node may not function correctly until context is started.');
        }

        // Extract initial values for constructor if possible, otherwise set after creation
        const initialFrequency = initialParams.find(p => p.id === 'frequency')?.currentValue as number ?? 350;
        const initialType = initialParams.find(p => p.id === 'type')?.currentValue as Tone.FilterType ?? "lowpass";
        // Rolloff is not in current params, default to -12
        const toneFilter = new Tone.Filter(initialFrequency, initialType, -12);


        const paramTargetsForCv = new Map<string, Tone.Param | Tone.Signal<any>>();
        paramTargetsForCv.set('frequency', toneFilter.frequency);
        paramTargetsForCv.set('Q', toneFilter.Q);
        paramTargetsForCv.set('gain', toneFilter.gain);

        // Apply remaining initial parameters (Q, gain, and potentially re-set type/freq if logic differs)
        this.updateNodeParams(
            {
                definition,
                instanceId,
                toneFilter,
                nodeForInputConnections: toneFilter,
                nodeForOutputConnections: toneFilter,
                paramTargetsForCv,
                node: undefined, // Deprecated
                mainProcessingNode: undefined, // Deprecated
            } as ManagedFilterNodeInfo,
            initialParams
        );

        return {
            toneFilter,
            nodeForInputConnections: toneFilter,
            nodeForOutputConnections: toneFilter,
            paramTargetsForCv,
            definition,
            instanceId,
            node: undefined,
            mainProcessingNode: undefined,
        };
    }

    updateNodeParams(
        nodeInfo: ManagedFilterNodeInfo,
        parameters: BlockParameter[]
    ): void {
        if (!nodeInfo.toneFilter) {
            console.warn('Tone.Filter node not found in nodeInfo for BiquadFilterNativeBlock', nodeInfo);
            return;
        }
        const toneFilter = nodeInfo.toneFilter;
        const context = Tone.getContext();

        parameters.forEach(param => {
            switch (param.id) {
                case 'frequency':
                    toneFilter.frequency.setTargetAtTime(Number(param.currentValue), context.currentTime, 0.01);
                    break;
                case 'q':
                    // Tone.Filter Q is a Param<"positive">.
                    toneFilter.Q.setTargetAtTime(Number(param.currentValue), context.currentTime, 0.01);
                    break;
                case 'gain':
                     // Tone.Filter gain is a Param<"decibels">.
                    toneFilter.gain.setTargetAtTime(Number(param.currentValue), context.currentTime, 0.01);
                    break;
                case 'type':
                    if (toneFilter.type !== param.currentValue as Tone.FilterType) {
                        toneFilter.type = param.currentValue as Tone.FilterType;
                    }
                    break;
                // case 'rolloff': // If rolloff parameter is added
                //    toneFilter.rolloff = Number(param.currentValue) as -12 | -24 | -48 | -96;
                //    break;
            }
        });
    }

    dispose(nodeInfo: ManagedFilterNodeInfo): void {
        if (nodeInfo.toneFilter) {
            nodeInfo.toneFilter.dispose();
            console.log(`Disposed Tone.Filter node for instanceId: ${nodeInfo.instanceId}`);
        }
    }

    connect(_destination: Tone.ToneAudioNode | AudioParam, _outputIndex?: number, _inputIndex?: number): void {
        console.warn(`BiquadFilterNativeBlock.connect called. Connections typically managed by AudioGraphConnectorService.`);
    }

    disconnect(_destination?: Tone.ToneAudioNode | AudioParam | number, _output?: number, _input?: number): void {
        console.warn(`BiquadFilterNativeBlock.disconnect called. Connections typically managed by AudioGraphConnectorService.`);
    }
}
