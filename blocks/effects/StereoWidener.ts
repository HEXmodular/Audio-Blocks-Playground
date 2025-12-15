// Basic structure for StereoWidener
import * as Tone from 'tone';
import {
    BlockDefinition,
    BlockInstance,
    NativeBlock,
} from '@interfaces/block';
import { createParameterDefinitions } from '@constants/constants';

const BLOCK_DEFINITION: BlockDefinition = {
    id: 'tone-stereowidener-v1',
    name: 'StereoWidener',
    description: 'A Tone.js StereoWidener node.',
    category: 'effects',
    inputs: [
        { id: 'audio_in', name: 'Audio', type: 'audio', description: 'Connects to Tone.StereoWidener input.' },
    ],
    outputs: [
        { id: 'audio_out', name: 'Audio Out', type: 'audio', description: 'Output.' }
    ],
    parameters: createParameterDefinitions([
        { id: 'width', name: 'Width', type: 'slider', toneParam: { minValue: 0, maxValue: 1 }, step: 0.01, defaultValue: 0.5, description: 'Stereo width (0-1).' },
        { id: 'wet', name: 'Wet Mix', type: 'slider', toneParam: { minValue: 0, maxValue: 1 }, step: 0.01, defaultValue: 1, description: 'Wet/dry mix (0-1).' },
    ]),
    compactRendererId: 'DefaultCompactRenderer',
};

export class StereoWidenerBlock extends Tone.StereoWidener implements NativeBlock {
    readonly name: string = BLOCK_DEFINITION.name;

    public static getDefinition(): BlockDefinition {
        return BLOCK_DEFINITION;
    }

    public updateFromBlockInstance(instance: BlockInstance): void {
        if (!instance?.parameters) {
            console.warn(`[StereoWidenerBlock updateFromBlockInstance ${instance?.instanceId || ''}] No parameters found in instance`, instance);
            return;
        }

        const context = Tone.getContext();
        instance.parameters.forEach(param => {
            switch (param.id) {
                case 'width':
                    if (this.width.value !== Number(param.currentValue)) {
                        this.width.setTargetAtTime(Number(param.currentValue), context.currentTime, 0.01);
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
