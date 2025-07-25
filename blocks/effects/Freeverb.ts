// Basic structure for Freeverb
import * as Tone from 'tone';
import {
    BlockDefinition,
    BlockInstance,
    NativeBlock,
} from '@interfaces/block';
import { createParameterDefinitions } from '@constants/constants';

const BLOCK_DEFINITION: BlockDefinition = {
    id: 'tone-freeverb-v1',
    name: 'Freeverb',
    description: 'A Tone.js Freeverb node.',
    category: 'effects',
    inputs: [
        { id: 'audio_in', name: 'Audio Input', type: 'audio', description: 'Connects to Tone.Freeverb input.' },
    ],
    outputs: [
        { id: 'audio_out', name: 'Audio Output', type: 'audio', description: 'Output.' }
    ],
    parameters: createParameterDefinitions([
        { id: 'roomSize', name: 'Room Size', type: 'slider', toneParam: { minValue: 0, maxValue: 1 }, step: 0.01, defaultValue: 0.7, description: 'The room size (0-1).' },
        { id: 'dampening', name: 'Dampening', type: 'slider', toneParam: { minValue: 0, maxValue: 20000 }, step: 1, defaultValue: 3000, description: 'The dampening frequency.' },
        { id: 'wet', name: 'Wet Mix', type: 'slider', toneParam: { minValue: 0, maxValue: 1 }, step: 0.01, defaultValue: 1, description: 'Wet/dry mix (0-1).' },
    ]),
    compactRendererId: 'DefaultCompactRenderer',
};

export class FreeverbBlock extends Tone.Freeverb implements NativeBlock {
    readonly name: string = BLOCK_DEFINITION.name;

    public static getDefinition(): BlockDefinition {
        return BLOCK_DEFINITION;
    }

    public updateFromBlockInstance(instance: BlockInstance): void {
        if (!instance?.parameters) {
            console.warn(`[FreeverbBlock updateFromBlockInstance ${instance?.instanceId || ''}] No parameters found in instance`, instance);
            return;
        }

        const context = Tone.getContext();
        instance.parameters.forEach(param => {
            switch (param.id) {
                case 'roomSize':
                    if (this.roomSize.value !== Number(param.currentValue)) {
                        this.roomSize.setTargetAtTime(Number(param.currentValue), context.currentTime, 0.01);
                    }
                    break;
                case 'dampening':
                    if (this.dampening.value !== Number(param.currentValue)) {
                        this.dampening.value = Number(param.currentValue);
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
