import * as Tone from 'tone';
import {
    BlockDefinition,
    BlockInstance,
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
            isAiGenerated: false,
            initialPrompt: '',
        };
    }

    constructor() { }

    setAudioContext(_context: any): void { } // Matched CreatableNode

    createNode(
        instanceId: string,
        definition: BlockDefinition,
        initialParams: BlockParameter[]
    ): ManagedAudioOutputNodeInfo {
        // console.log(`[AudioOutputNativeBlock createNode] Instance ID: ${instanceId}, Definition ID: ${definition.id}, Initial Params:`, initialParams); // REMOVED
        if (Tone.getContext().state !== 'running') {
            console.warn(`[AudioOutputNativeBlock createNode] Tone.js context is not running for instance ${instanceId}. Audio Output may not function correctly.`); // Kept warn
        }

        const toneGain = new Tone.Gain();
        const volumeParam = initialParams.find(p => p.id === 'volume');
        toneGain.gain.value = volumeParam ? Number(volumeParam.currentValue) : 0.7;
        // console.log(`[AudioOutputNativeBlock createNode] Created Tone.Gain for ${instanceId}. Initial gain value: ${toneGain.gain.value}`); // REMOVED

        toneGain.connect(Tone.getDestination());
        // console.log(`[AudioOutputNativeBlock createNode] Connected Tone.Gain for ${instanceId} to Tone.getDestination().`); // REMOVED

        const specificParamTargetsForCv = new Map<string, AudioParam | Tone.Param<any> | Tone.Signal<any>>([
            ['volume', toneGain.gain as unknown as Tone.Param<any>],
        ]);

        const nodeInfo: ManagedAudioOutputNodeInfo = {
            definition,
            instanceId,
            toneGain,
            node: toneGain as unknown as Tone.ToneAudioNode,
            nodeForInputConnections: toneGain as unknown as Tone.ToneAudioNode,
            nodeForOutputConnections: null,
            mainProcessingNode: toneGain as unknown as Tone.ToneAudioNode,
            paramTargetsForCv: specificParamTargetsForCv,
            internalGainNode: toneGain as unknown as Tone.Gain,


            internalState: {},
        };

        // console.log(`[AudioOutputNativeBlock createNode] nodeForInputConnections for ${instanceId}: ${nodeInfo.nodeForInputConnections?.constructor.name}`); // REMOVED
        // console.log(`[AudioOutputNativeBlock createNode] Final nodeInfo object for ${instanceId}:`, nodeInfo); // REMOVED

        // this.updateNodeParams(nodeInfo, initialParams);

        return nodeInfo;
    }

    updateNodeParams(
        nodeInfo: ManagedAudioOutputNodeInfo,
        insctance: BlockInstance,
    ): void {
        // console.log(`[AudioOutputNativeBlock updateNodeParams] Instance ID: ${nodeInfo.instanceId}, Parameters:`, parameters); // REMOVED
        if (!nodeInfo.toneGain) {
            console.warn(`[AudioOutputNativeBlock updateNodeParams] Tone.Gain not available for instance ${nodeInfo.instanceId}.`); // Kept warn
            return;
        }
        const currentToneGain = nodeInfo.toneGain;
        const context = Tone.getContext();
        const parameters = insctance.parameters || [];

        const volumeParam = parameters.find(p => p.id === 'volume');
        if (volumeParam && currentToneGain.gain) {
            const targetVolume = Number(volumeParam.currentValue);
            // console.log(`[AudioOutputNativeBlock updateNodeParams] Instance ID: ${nodeInfo.instanceId}, Setting gain to: ${targetVolume}`); // REMOVED
            currentToneGain.gain.setTargetAtTime(targetVolume, context.currentTime, 0.01);
        }
    }

    dispose(nodeInfo: ManagedAudioOutputNodeInfo): void {
        // console.log(`[AudioOutputNativeBlock dispose] Disposing resources for Instance ID: ${nodeInfo.instanceId}`); // REMOVED
        if (nodeInfo.toneGain) {
            // console.log(`[AudioOutputNativeBlock dispose] Disconnecting Tone.Gain from Tone.getDestination() for Instance ID: ${nodeInfo.instanceId}`); // REMOVED
            nodeInfo.toneGain.disconnect(Tone.getDestination());
            // console.log(`[AudioOutputNativeBlock dispose] Disposing Tone.Gain for Instance ID: ${nodeInfo.instanceId}`); // REMOVED
            nodeInfo.toneGain.dispose();
            // console.log(`[AudioOutputNativeBlock dispose] Finished disposing Tone.Gain for Instance ID: ${nodeInfo.instanceId}`); // REMOVED
        }
    }

    connect(_destination: any, _outputIndex?: number, _inputIndex?: number): any {
        console.warn(`AudioOutputNativeBlock.connect called, but it has no audio outputs.`);
    }

    disconnect(_destination?: any, _output?: number, _input?: number): void {
        console.warn(`AudioOutputNativeBlock.disconnect called. Input connections are managed externally. Internal connection to Destination handled on dispose.`);
    }
}
