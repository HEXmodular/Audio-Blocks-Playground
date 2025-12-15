// Basic structure for AutoPanner
import * as Tone from 'tone';
import {
    BlockDefinition,
    BlockInstance,
    BlockParameter,
    NativeBlock,
} from '@interfaces/block';
import { createParameterDefinitions } from '@constants/constants';

const BLOCK_DEFINITION: BlockDefinition = {
    id: 'tone-autopanner-v1',
    name: 'AutoPanner',
    description: 'A Tone.js AutoPanner node.',
    category: 'effects',
    inputs: [
        { id: 'audio_in', name: 'Audio', type: 'audio', description: 'Connects to Tone.AutoPanner input.' },
        // TODO: Add CV inputs for parameters
    ],
    outputs: [
        { id: 'audio_out', name: 'Audio Out', type: 'audio', description: 'Output.' }
    ],
    parameters: createParameterDefinitions([
        { id: 'frequency', name: 'Frequency', type: 'slider', toneParam: { minValue: 0.1, maxValue: 10 }, step: 0.1, defaultValue: 1, description: 'Panning frequency.' },
        { id: 'depth', name: 'Depth', type: 'slider', toneParam: { minValue: 0, maxValue: 1 }, step: 0.01, defaultValue: 1, description: 'Panning depth.' },
        { id: 'wet', name: 'Wet Mix', type: 'slider', toneParam: { minValue: 0, maxValue: 1 }, step: 0.01, defaultValue: 1, description: 'Wet/dry mix (0-1).' },
    ]),
    compactRendererId: 'DefaultCompactRenderer',
};

export class AutoPannerBlock extends Tone.AutoPanner implements NativeBlock {
    readonly name: string = BLOCK_DEFINITION.name;

    public static getDefinition(): BlockDefinition {
        return BLOCK_DEFINITION;
    }

    public updateFromBlockInstance(instance: BlockInstance): void {
        if (!instance?.parameters) {
            console.warn(`[AutoPannerBlock updateFromBlockInstance ${instance?.instanceId || ''}] No parameters found in instance`, instance);
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
                case 'depth':
                    if (this.depth.value !== Number(param.currentValue)) {
                        this.depth.setTargetAtTime(Number(param.currentValue), context.currentTime, 0.01);
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
