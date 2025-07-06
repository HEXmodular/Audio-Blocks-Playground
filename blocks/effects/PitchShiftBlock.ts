import * as Tone from 'tone';
import {
    BlockDefinition,
    BlockInstance,
    BlockParameter,
    NativeBlock,
} from '@interfaces/block';
import { createParameterDefinitions } from '@constants/constants';

// Options for the constructor
interface PitchShiftNodeOptions extends Tone.PitchShiftOptions {
    initialParams?: BlockParameter[];
    instanceId?: string;
}

const BLOCK_DEFINITION: BlockDefinition = {
    id: 'tone-pitchshift-v1',
    name: 'Pitch Shift',
    description: 'A Tone.js PitchShift node, for near-realtime pitch shifting.',
    category: 'pitch',
    inputs: [
        { id: 'audio_in', name: 'Audio Input', type: 'audio', description: 'Connects to Tone.PitchShift input.' },
        { id: 'pitch', name: 'Pitch', type: 'number', description: 'Modulates pitch shift amount (semitones).' },
        { id: 'windowSize', name: 'Delay Time', type: 'number', description: 'Modulates delay time.' },
        { id: 'feedback', name: 'Feedback', type: 'number', description: 'Modulates feedback amount.' },
        { id: 'wet', name: 'Wet CV', type: 'audio', description: 'Modulates wet/dry mix.' },
    ],
    outputs: [
        { id: 'audio_out', name: 'Audio Output', type: 'audio', description: 'Output.' }
    ],
    parameters: createParameterDefinitions([
        { id: 'pitch', name: 'Pitch (Semitones)', type: 'slider', toneParam: { minValue: -24, maxValue: 24 }, step: 1, defaultValue: 0, description: 'Pitch shift amount in semitones.' },
        { id: 'windowSize', name: 'Window Size (s)', type: 'slider', toneParam: { minValue: 0.03, maxValue: 0.1 }, step: 0.001, defaultValue: 0.03, description: 'Grain window size in seconds.' },
        { id: 'feedback', name: 'Feedback', type: 'slider', toneParam: { minValue: 0, maxValue: 1 }, step: 0.01, defaultValue: 0, description: 'Feedback amount (0-1).' },
        { id: 'wet', name: 'Wet Mix', type: 'slider', toneParam: { minValue: 0, maxValue: 1 }, step: 0.01, defaultValue: 1, description: 'Wet/dry mix (0-1).' },
    ]),
    compactRendererId: 'DefaultCompactRenderer',
};

export class PitchShiftBlock extends Tone.PitchShift implements NativeBlock {
    readonly name: string = BLOCK_DEFINITION.name;
    // readonly inputNode: Tone.ToneAudioNode;
    // readonly outputNode: Tone.ToneAudioNode;

    // constructor() {
    //     super();
    //     const b = new     Tone.LFO
    //     const a = new     Tone.PitchShift().delayTime
    //     const c = new     Tone.PitchShift().delayTime
    //     b.connect(a)
    // }

    public static getDefinition(): BlockDefinition {
        return BLOCK_DEFINITION;
    }

    public updateFromBlockInstance(instance: BlockInstance): void {
        if (!instance?.parameters) {
            console.warn(`[PitchShiftBlock updateFromBlockInstance ${instance?.instanceId || ''}] No parameters found in instance`, instance);
            return;
        }

        const context = Tone.getContext();
        instance.parameters.forEach(param => {
            switch (param.id) {
                case 'pitch':
                    if (this.pitch !== Number(param.currentValue)) {
                        this.pitch = Number(param.currentValue);
                    }
                    break;
                case 'windowSize':
                    if (this.windowSize !== Number(param.currentValue)) {
                        // windowSize is not a Param, so direct assignment
                        this.windowSize = Number(param.currentValue);
                    }
                    break;
                case 'feedback':
                    if (this.feedback.value !== Number(param.currentValue)) {
                        this.feedback.setTargetAtTime(Number(param.currentValue), context.currentTime, 0.01);
                    }
                    break;
                case 'wet':
                    if (this.wet.value !== Number(param.currentValue)) {
                        this.wet.setTargetAtTime(Number(param.currentValue), context.currentTime, 0.01);
                    }
                    break;
            }
        });
    }
}
