import * as Tone from 'tone';
import {
    BlockDefinition,
    BlockInstance,
    NativeBlock,
} from '@interfaces/block';

// Options for the constructor, similar to ByteBeatPlayer
interface AudioOutputNodeOptions extends Tone.ToneAudioNodeOptions {
}

const BLOCK_DEFINITION: BlockDefinition = {
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

export class AudioOutputBlock extends Tone.ToneAudioNode<AudioOutputNodeOptions> implements NativeBlock {
    readonly name: string = BLOCK_DEFINITION.name; // Keep name consistent

    // Input is the internalGain node
    readonly input: Tone.ToneAudioNode;
    readonly output: undefined; // Or Tone.ToneDestinationNode if we want to represent it

    constructor(options?: AudioOutputNodeOptions) {
        super(options);

        if (Tone.getContext().state !== 'running') {
            console.warn(`[AudioOutputBlock constructor] Tone.js context is not running. Audio Output may not function correctly.`);

        }

        const internalGain = new Tone.Gain(1)
        internalGain.connect(Tone.getDestination());
        this.input = internalGain;//Tone.getDestination(); // Assign internal gain to the input proxy

    }

    public static getDefinition(): BlockDefinition {
        return BLOCK_DEFINITION;
    }

    // This method will be adapted from the old updateNodeParams
    public updateFromBlockInstance(instance: BlockInstance): void {
    }
}
