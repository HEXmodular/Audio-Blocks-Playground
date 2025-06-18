import * as Tone from 'tone';
import {
    BlockDefinition,
    BlockParameter,
    ManagedNativeNodeInfo as OriginalManagedNativeNodeInfo
} from '@interfaces/common';
import { CreatableNode } from './CreatableNode';
import { createParameterDefinitions } from '@constants/constants';

export interface ManagedAudioOutputNodeInfo extends OriginalManagedNativeNodeInfo {
  toneGain?: Tone.Gain; // Internal gain for volume control
}

export class AudioOutputNativeBlock implements CreatableNode {
    // private context: Tone.Context | null = null; // No need to store context if using global

    public static getDefinition(): BlockDefinition {
      return {
        id: 'system-audio-output-tone-v1', // New ID for Tone.js version
        name: 'Audio Output (Tone)',
        description: 'Plays the incoming audio signal through Tone.Destination. Contains an internal Tone.Gain for volume control.',
        runsAtAudioRate: true,
        inputs: [
            { id: 'audio_in', name: 'Audio Input', type: 'audio', description: 'Signal to play. Connects to the internal volume Tone.Gain.' },
            // Optionally, add CV for volume
            { id: 'volume_cv_in', name: 'Volume CV', type: 'audio', description: 'Modulates output volume.', audioParamTarget: 'volume', isOptional: true}
        ],
        outputs: [], // No audio outputs from this block
        parameters: createParameterDefinitions([
            { id: 'volume', name: 'Volume', type: 'slider', min: 0, max: 1, step: 0.01, defaultValue: 0.7, description: 'Output volume level (controls an internal Tone.Gain).' }
        ]),
        logicCode: "",
        isAiGenerated: false,
        initialPrompt: '',
      };
    }

    constructor() {
        // Global Tone.context is assumed.
    }

    setAudioContext(_context: Tone.Context | null): void {
        // This method might not be strictly necessary.
    }

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

        // Connect the internal gain to Tone.Destination
        toneGain.connect(Tone.getDestination());

        const paramTargetsForCv = new Map<string, Tone.Param | Tone.Signal<any>>();
        paramTargetsForCv.set('volume', toneGain.gain);


        return {
            // node: toneGain, // The internal Tone.Gain is the primary node for this block's logic
            nodeForInputConnections: toneGain, // External nodes connect to this gain node
            // nodeForOutputConnections: undefined, // No audio output from this block
            // mainProcessingNode: toneGain,
            paramTargetsForCv,
            definition,
            instanceId,
            toneGain, // Store the Tone.Gain node
            // Deprecated/unused from OriginalManagedNativeNodeInfo for this block:
            node: undefined,
            nodeForOutputConnections: undefined,
            mainProcessingNode: undefined,
            internalGainNode: undefined, // Old field
        };
    }

    updateNodeParams(
        nodeInfo: ManagedAudioOutputNodeInfo,
        parameters: BlockParameter[]
    ): void {
        if (!nodeInfo.toneGain) {
            console.warn("AudioOutputNativeBlock: Tone.Gain not available for update.");
            return;
        }
        const toneGain = nodeInfo.toneGain;
        const context = Tone.getContext();

        const volumeParam = parameters.find(p => p.id === 'volume');
        if (volumeParam && toneGain.gain) {
            // Assuming volumeParam.currentValue is linear 0-1
            toneGain.gain.setTargetAtTime(Number(volumeParam.currentValue), context.currentTime, 0.01);
        }
    }

    dispose(nodeInfo: ManagedAudioOutputNodeInfo): void {
        if (nodeInfo.toneGain) {
            nodeInfo.toneGain.disconnect(Tone.getDestination()); // Disconnect from global destination
            nodeInfo.toneGain.dispose();
            console.log(`Disposed Tone.Gain in AudioOutput for instanceId: ${nodeInfo.instanceId}`);
        }
    }

    connect(_destination: Tone.ToneAudioNode | AudioParam, _outputIndex?: number, _inputIndex?: number): void {
        // This block doesn't output audio to other blocks, so this method is unlikely to be used by graph connector.
        console.warn(`AudioOutputNativeBlock.connect called, but it has no audio outputs.`);
    }

    disconnect(_destination?: Tone.ToneAudioNode | AudioParam | number, _output?: number, _input?: number): void {
        // This block's input connections are managed by the graph connector via nodeInfo.nodeForInputConnections (the toneGain).
        // The internal connection to Tone.Destination is handled in dispose.
        console.warn(`AudioOutputNativeBlock.disconnect called. Input connections are managed externally. Internal connection to Destination handled on dispose.`);
    }
}
