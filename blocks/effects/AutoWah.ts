// Basic structure for AutoWah
import * as Tone from 'tone';
import {
    BlockDefinition,
    BlockInstance,
    BlockParameter,
    NativeBlock,
} from '@interfaces/block';
import { createParameterDefinitions } from '@constants/constants';

const BLOCK_DEFINITION: BlockDefinition = {
    id: 'tone-autowah-v1',
    name: 'AutoWah',
    description: 'A Tone.js AutoWah node.',
    category: 'effects', // Or modulation?
    inputs: [
        { id: 'audio_in', name: 'Audio', type: 'audio', description: 'Connects to Tone.AutoWah input.' },
        // TODO: Add CV inputs for parameters
    ],
    outputs: [
        { id: 'audio_out', name: 'Audio Out', type: 'audio', description: 'Output.' }
    ],
    parameters: createParameterDefinitions([
        { id: 'baseFrequency', name: 'Base Frequency', type: 'slider', toneParam: { minValue: 20, maxValue: 20000 }, step: 1, defaultValue: 100, description: 'Base filter frequency.' },
        { id: 'octaves', name: 'Octaves', type: 'slider', toneParam: { minValue: 0, maxValue: 10 }, step: 0.1, defaultValue: 6, description: 'Modulation octaves.' },
        { id: 'sensitivity', name: 'Sensitivity', type: 'slider', toneParam: { minValue: -40, maxValue: 0 }, step: 1, defaultValue: 0, description: 'Wah sensitivity (dB).' },
        { id: 'Q', name: 'Q', type: 'slider', toneParam: { minValue: 0, maxValue: 20 }, step: 0.1, defaultValue: 2, description: 'Filter Q factor.' },
        { id: 'gain', name: 'Gain', type: 'slider', toneParam: { minValue: 0, maxValue: 10 }, step: 0.1, defaultValue: 2, description: 'Gain amount.' },
        { id: 'wet', name: 'Wet Mix', type: 'slider', toneParam: { minValue: 0, maxValue: 1 }, step: 0.01, defaultValue: 1, description: 'Wet/dry mix (0-1).' },
    ]),
    compactRendererId: 'DefaultCompactRenderer',
};

export class AutoWahBlock extends Tone.AutoWah implements NativeBlock {
    readonly name: string = BLOCK_DEFINITION.name;

    public static getDefinition(): BlockDefinition {
        return BLOCK_DEFINITION;
    }

    public updateFromBlockInstance(instance: BlockInstance): void {
        if (!instance?.parameters) {
            console.warn(`[AutoWahBlock updateFromBlockInstance ${instance?.instanceId || ''}] No parameters found in instance`, instance);
            return;
        }

        const context = Tone.getContext();
        instance.parameters.forEach(param => {
            switch (param.id) {
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
                case 'sensitivity':
                    if (this.sensitivity !== Number(param.currentValue)) {
                        this.sensitivity = Number(param.currentValue);
                    }
                    break;
                case 'Q':
                    if (this.Q.value !== Number(param.currentValue)) {
                         this.Q.setTargetAtTime(Number(param.currentValue), context.currentTime, 0.01);
                    }
                    break;
                case 'gain':
                    if (this.gain.value !== Number(param.currentValue)) {
                         this.gain.setTargetAtTime(Number(param.currentValue), context.currentTime, 0.01);
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
