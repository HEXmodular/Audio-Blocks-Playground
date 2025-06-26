import * as Tone from 'tone';
import {
    BlockDefinition,
    BlockInstance,
    BlockParameter,
    // ManagedNativeNodeInfo as OriginalManagedNativeNodeInfo // This was related to the old structure
} from '@interfaces/block';
// AudioParam is a global type, no need to import from common
// import { CreatableNode } from './CreatableNode'; // Removed
import { createParameterDefinitions } from '@constants/constants';
// Tone types like Tone.ToneAudioNode should be used with the Tone prefix.

// Options for the constructor, similar to ByteBeatPlayer
interface AudioOutputNodeOptions extends Tone.ToneAudioNodeOptions {
    // initialParams?: BlockParameter[];
    // definition is not strictly needed if we fetch it statically or pass it if required by ToneAudioNode's pattern
}

// export interface ManagedAudioOutputNodeInfo extends OriginalManagedNativeNodeInfo {
// toneGain?: Tone.Gain;
// } // This interface is no longer needed as the class itself is the managed node.

export class AudioOutputNativeBlock extends Tone.ToneAudioNode<AudioOutputNodeOptions> {
    readonly name: string = 'Audio Output (Tone)'; // Keep name consistent
    // private _internalGain: Tone.Gain;

    // Input is the internalGain node
    readonly input: Tone.ToneAudioNode;
    readonly output: undefined; // Or Tone.ToneDestinationNode if we want to represent it

    public static getDefinition(): BlockDefinition {
        return {
            id: 'system-audio-output-tone-v1',
            name: 'Audio Output (Tone)',
            description: 'Plays the incoming audio signal through Tone.Destination. Contains an internal Tone.Gain for volume control.',
            inputs: [
                { id: 'audio_in', name: 'Audio Input', type: 'audio', description: 'Signal to play. Connects to the internal volume Tone.Gain.' },
                // { id: 'volume_cv_in', name: 'Volume CV', type: 'audio', description: 'Modulates output volume.', audioParamTarget: 'volume' }
            ],
            outputs: [],
            parameters: [],
        };
    }

    constructor(options?: AudioOutputNodeOptions) {
        super(options);

        if (Tone.getContext().state !== 'running') {
            console.warn(`[AudioOutputNativeBlock constructor] Tone.js context is not running. Audio Output may not function correctly.`);

        }

        // const initialParams = options.initialParams || [];
        // const volumeParam = initialParams.find(p => p.id === 'volume');
        // const initialVolume = volumeParam ? Number(volumeParam.currentValue) : 0.7;

        const internalGain = new Tone.Gain(1)
        internalGain.connect(Tone.getDestination());
        this.input = internalGain;//Tone.getDestination(); // Assign internal gain to the input proxy
        internalGain.context.debug = true; // Enable debug mode for the internal gain

    }

    // This method will be adapted from the old updateNodeParams
    public updateFromBlockInstance(instance: BlockInstance): void {
        // const parameters = instance.parameters || [];
        // const volumeParam = parameters.find(p => p.id === 'volume');
        // if (volumeParam && this._internalGain && this._internalGain.gain) {
        //     const targetVolume = Number(volumeParam.currentValue);
        //     this._internalGain.gain.setTargetAtTime(targetVolume, this.context.currentTime, 0.01);
        //     // console.log(`[AudioOutputNativeBlock updateFromBlockInstance] Setting gain to: ${targetVolume}`);
        // } else {
        //     console.warn(`[AudioOutputNativeBlock updateFromBlockInstance] Volume parameter or internal gain not available for instance ${instance.instanceId}.`);
        // }
    }


    // Old updateNodeParams - to be removed after adapting its logic to updateFromBlockInstance
    // */
    // The old updateNodeParams is now removed as its logic is in updateFromBlockInstance


    // Overridden dispose from Tone.ToneAudioNode
    dispose(): this {
        // console.log(`[AudioOutputNativeBlock dispose] Disposing resources.`);
        // if (this._internalGain) {
        //     // console.log(`[AudioOutputNativeBlock dispose] Disconnecting internal Tone.Gain from Tone.getDestination().`);
        //     this._internalGain.disconnect(Tone.getDestination());
        //     // console.log(`[AudioOutputNativeBlock dispose] Disposing internal Tone.Gain.`);
        //     this._internalGain.dispose();
        // }
        // Call super.dispose() to handle Tone.js specific cleanup
        super.dispose();
        // console.log("[AudioOutputNativeBlock] Disposed.");
        return this;
    }

    // The old dispose(nodeInfo: ManagedAudioOutputNodeInfo) is removed.

    /**
     * Returns the Tone.Param or Tone.Signal instance for a given parameter ID that can be targeted by CV.
     * This is used by the AudioGraphConnectorService to establish CV connections.
     * @param paramId The ID of the parameter (e.g., 'volume' from the block definition).
     * @returns The Tone.Param or Tone.Signal instance, or undefined if not found.
     */
    // public getParamTargetForCv(paramId: string): Tone.Param<"decibels"> | Tone.Signal<any> | undefined {
    //     if (paramId === 'volume' && this._internalGain) {
    //         return this._internalGain.gain;
    //     }
    //     console.warn(`[AudioOutputNativeBlock getParamTargetForCv] CV target for param ID "${paramId}" not found.`);
    //     return undefined;
    // }

    // The connect and disconnect methods from the old CreatableNode interface are removed,
    // as ToneAudioNode handles its own connections.
    // Users will connect to `this.input` (which is `this._internalGain`).
}
