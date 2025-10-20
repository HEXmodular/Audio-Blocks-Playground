// Basic structure for AutoFilter
import * as Tone from 'tone';
import {
    BlockDefinition,
    BlockInstance,
    BlockParameter,
    NativeBlock,
} from '@interfaces/block';
import { createParameterDefinitions } from '@constants/constants';

// TODO: Define options if necessary
// interface AutoFilterNodeOptions extends Tone.AutoFilterOptions {
//     initialParams?: BlockParameter[];
//     instanceId?: string;
// }

const BLOCK_DEFINITION: BlockDefinition = {
    id: 'tone-autofilter-v1',
    name: 'AutoFilter',
    description: 'A Tone.js AutoFilter node.',
    category: 'effects', // Or modulation?
    inputs: [
        { id: 'audio_in', name: 'Audio Input', type: 'audio', description: 'Connects to Tone.AutoFilter input.' },
        // TODO: Add CV inputs for parameters
    ],
    outputs: [
        { id: 'audio_out', name: 'Audio Out', type: 'audio', description: 'Output.' }
    ],
    parameters: createParameterDefinitions([
        // TODO: Define parameters based on Tone.AutoFilter
        { id: 'frequency', name: 'Frequency', type: 'slider', toneParam: { minValue: 20, maxValue: 20000 }, step: 1, defaultValue: 200, description: 'Filter frequency.' },
        { id: 'baseFrequency', name: 'Base Frequency', type: 'slider', toneParam: { minValue: 20, maxValue: 20000 }, step: 1, defaultValue: 200, description: 'Base filter frequency.' },
        { id: 'octaves', name: 'Octaves', type: 'slider', toneParam: { minValue: 0, maxValue: 10 }, step: 0.1, defaultValue: 2.6, description: 'Modulation octaves.' },
        { id: 'wet', name: 'Wet Mix', type: 'slider', toneParam: { minValue: 0, maxValue: 1 }, step: 0.01, defaultValue: 1, description: 'Wet/dry mix (0-1).' },
    ]),
    compactRendererId: 'DefaultCompactRenderer',
};

export class AutoFilterBlock extends Tone.AutoFilter implements NativeBlock {
    readonly name: string = BLOCK_DEFINITION.name;

    public static getDefinition(): BlockDefinition {
        return BLOCK_DEFINITION;
    }

    public updateFromBlockInstance(instance: BlockInstance): void {
        if (!instance?.parameters) {
            console.warn(`[AutoFilterBlock updateFromBlockInstance ${instance?.instanceId || ''}] No parameters found in instance`, instance);
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
                case 'baseFrequency':
                    if (this.baseFrequency !== Number(param.currentValue)) {
                        this.baseFrequency = Number(param.currentValue);
                    }
                    break;
                case 'octaves':
                    if (this.octaves !== Number(param.currentValue)) {
                        this.octaves = Number(param.currentValue);
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
