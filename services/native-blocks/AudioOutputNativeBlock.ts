import * as Tone from 'tone';
import {
    BlockDefinition,
    BlockParameter,
    ManagedNativeNodeInfo as OriginalManagedNativeNodeInfo
} from '@interfaces/common';
// AudioParam is a global type, no need to import from common
import { CreatableNode } from './CreatableNode';
import { createParameterDefinitions } from '@constants/constants';
// Native types like AudioParam, GainNode, ConstantSourceNode are globally available
// Tone types like Tone.ToneAudioNode should be used with the Tone prefix.

export interface ManagedAudioOutputNodeInfo extends OriginalManagedNativeNodeInfo {
  toneGain?: Tone.Gain;
}

export class AudioOutputNativeBlock implements CreatableNode {
    public static getDefinition(): BlockDefinition {
      return {
        id: 'system-audio-output-tone-v1',
        name: 'Audio Output (Tone)',
        description: 'Plays the incoming audio signal through Tone.Destination. Contains an internal Tone.Gain for volume control.',
        runsAtAudioRate: true,
        inputs: [
            { id: 'audio_in', name: 'Audio Input', type: 'audio', description: 'Signal to play. Connects to the internal volume Tone.Gain.' },
            { id: 'volume_cv_in', name: 'Volume CV', type: 'audio', description: 'Modulates output volume.', audioParamTarget: 'volume' }
        ],
        outputs: [],
        parameters: createParameterDefinitions([
            { id: 'volume', name: 'Volume', type: 'slider', min: 0, max: 1, step: 0.01, defaultValue: 0.7, description: 'Output volume level (controls an internal Tone.Gain).' }
        ]),
        logicCode: "",
        isAiGenerated: false,
        initialPrompt: '',
      };
    }

    constructor() {}

    setAudioContext(_context: any): void {} // Matched CreatableNode

    createNode(
        instanceId: string,
        definition: BlockDefinition,
        initialParams: BlockParameter[]
    ): ManagedAudioOutputNodeInfo {
        if (Tone.getContext().state !== 'running') {
            console.warn('Tone.js context is not running. Audio Output may not function correctly.');
        }

        const toneGain = new Tone.Gain();
        const volumeParam = initialParams.find(p => p.id === 'volume');
        toneGain.gain.value = volumeParam ? Number(volumeParam.currentValue) : 0.7;

        toneGain.connect(Tone.getDestination());

        const specificParamTargetsForCv = new Map<string, AudioParam | Tone.Param<any> | Tone.Signal<any>>([
            ['volume', toneGain.gain as unknown as Tone.Param<any>], // Correctly cast
        ]);

        const nodeInfo: ManagedAudioOutputNodeInfo = {
            definition,
            instanceId,
            toneGain,
            node: toneGain as unknown as Tone.ToneAudioNode,
            nodeForInputConnections: toneGain as unknown as Tone.ToneAudioNode,
            nodeForOutputConnections: null,
            mainProcessingNode: toneGain as unknown as Tone.ToneAudioNode, // Can be undefined if not applicable
            paramTargetsForCv: specificParamTargetsForCv,
            internalGainNode: toneGain as unknown as Tone.Gain,
            allpassInternalNodes: undefined,
            constantSourceValueNode: undefined,
            internalState: {},
        };

        this.updateNodeParams(nodeInfo, initialParams);

        return nodeInfo;
    }

    updateNodeParams(
        nodeInfo: ManagedAudioOutputNodeInfo,
        parameters: BlockParameter[]
    ): void {
        if (!nodeInfo.toneGain) {
            console.warn("AudioOutputNativeBlock: Tone.Gain not available for update.");
            return;
        }
        const currentToneGain = nodeInfo.toneGain; // Renamed
        const context = Tone.getContext();

        const volumeParam = parameters.find(p => p.id === 'volume');
        if (volumeParam && currentToneGain.gain) {
            currentToneGain.gain.setTargetAtTime(Number(volumeParam.currentValue), context.currentTime, 0.01);
        }
    }

    dispose(nodeInfo: ManagedAudioOutputNodeInfo): void {
        if (nodeInfo.toneGain) {
            nodeInfo.toneGain.disconnect(Tone.getDestination());
            nodeInfo.toneGain.dispose();
            console.log(`Disposed Tone.Gain in AudioOutput for instanceId: ${nodeInfo.instanceId}`);
        }
    }

    connect(_destination: any, _outputIndex?: number, _inputIndex?: number): any {
        console.warn(`AudioOutputNativeBlock.connect called, but it has no audio outputs.`);
    }

    disconnect(_destination?: any, _output?: number, _input?: number): void {
        console.warn(`AudioOutputNativeBlock.disconnect called. Input connections are managed externally. Internal connection to Destination handled on dispose.`);
    }
}
