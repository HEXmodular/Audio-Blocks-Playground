import * as Tone from 'tone';
import { BlockDefinition, BlockInstance, BlockParameter, NativeBlock } from '@interfaces/block';
import { createParameterDefinitions } from '../../constants/constants';

// Options for the constructor
// interface BiquadFilterNodeOptions extends Tone.ToneAudioNodeOptions {
//     initialParams?: BlockParameter[];
//     // Add instanceId to options if needed by the superclass or for logging
//     instanceId?: string;
// }

const BLOCK_DEFINITION: BlockDefinition = {
    id: 'tone-filter-v1',
    name: 'Filter (Tone)',
    description: 'A Filter, providing various filter types.',
    inputs: [
        { id: 'audio_in', name: 'Audio Input', type: 'audio', description: 'Connects to Filter input.' },
        // For CV inputs, we need to ensure they are represented in the definition
        // if AudioGraphConnectorService relies on this for creating connections.
        // The getCvInput method will provide the actual Tone.Param/Signal.
        { id: 'frequency', name: 'Freq CV', type: 'audio', description: 'Modulates filter frequency.'},
        { id: 'Q', name: 'Q CV', type: 'audio', description: 'Modulates filter Q factor.'},
        { id: 'gain', name: 'Gain CV', type: 'audio', description: 'Modulates filter gain.'}
    ],
    outputs: [
        { id: 'audio_out', name: 'Audio Output', type: 'audio', description: 'Output.' }
    ],
    parameters: createParameterDefinitions([
        { id: 'frequency', name: 'Frequency', type: 'slider', toneParam: { minValue: 20, maxValue: 20000 }, step: 1, defaultValue: 350, description: 'Filter cutoff/center frequency in Hz.', isFrequency: true },
        { id: 'Q', name: 'Q Factor', type: 'slider', toneParam: { minValue: 0.0001, maxValue: 100 }, step: 0.0001, defaultValue: 1, description: 'Quality factor, controlling bandwidth.' },
        { id: 'gain', name: 'Gain (dB)', type: 'slider', toneParam: { minValue: -40, maxValue: 40 }, step: 0.1, defaultValue: 0, description: 'Gain in decibels, for Peaking, Lowshelf, Highshelf filters.' },
        {
            id: 'type',
            name: 'Filter Type',
            type: 'select',
            options: [
                { value: "lowpass", label: "Lowpass" }, { value: "highpass", label: "Highpass" },
                { value: "bandpass", label: "Bandpass" }, { value: "notch", label: "Notch" },
                { value: "allpass", label: "Allpass" }, { value: "peaking", label: "Peaking" },
                { value: "lowshelf", label: "Lowshelf" }, { value: "highshelf", label: "Highshelf" }
            ],
            defaultValue: "lowpass",
            description: 'The type of filtering algorithm.'
        },
    ]),
    compactRendererId: 'DefaultCompactRenderer',
};

export class BiquadFilterBlock extends Tone.Filter implements NativeBlock {
    readonly name: string = BLOCK_DEFINITION.name;

    constructor() {
        super();
    }

    public static getDefinition(): BlockDefinition {
        return BLOCK_DEFINITION;
    }

    public updateFromBlockInstance(instance: BlockInstance): void {
        if (!instance?.parameters) {
            console.warn(`[BiquadFilterBlock updateFromBlockInstance ${instance?.instanceId || ''}] No parameters found in instance`, instance);
            return;
        }

        const context = Tone.getContext();
        instance.parameters.forEach(param => {
            switch (param.id) {
                case 'frequency':
                    if (this.frequency.value !== Number(param.currentValue)) {
                        this.frequency.setTargetAtTime(Number(param.currentValue), context.currentTime, 0.01);
                    }
                    break;
                case 'q':
                    if (this.Q.value !== Number(param.currentValue)) {
                        this.Q.setTargetAtTime(Number(param.currentValue), context.currentTime, 0.01);
                    }
                    break;
                case 'gain':
                    if (this.gain.value !== Number(param.currentValue)) {
                        this.gain.setTargetAtTime(Number(param.currentValue), context.currentTime, 0.01);
                    }
                    break;
                case 'type':
                    if (this.type !== param.currentValue as string) {
                        this.type = param.currentValue as BiquadFilterType;
                    }
                    break;
            }
        });
    }
}
