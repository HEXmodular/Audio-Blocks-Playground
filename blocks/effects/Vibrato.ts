// Basic structure for Vibrato
import * as Tone from 'tone';
import {
    BlockDefinition,
    BlockInstance,
    NativeBlock,
} from '@interfaces/block';
import { createParameterDefinitions } from '@constants/constants';

const BLOCK_DEFINITION: BlockDefinition = {
    id: 'tone-vibrato-v1',
    name: 'Vibrato',
    description: 'A Tone.js Vibrato node.',
    category: 'effects',
    inputs: [
        { id: 'audio_in', name: 'Audio Input', type: 'audio', description: 'Connects to Tone.Vibrato input.' },
    ],
    outputs: [
        { id: 'audio_out', name: 'Audio Output', type: 'audio', description: 'Output.' }
    ],
    parameters: createParameterDefinitions([
        { id: 'frequency', name: 'Frequency', type: 'slider', toneParam: { minValue: 0, maxValue: 100 }, step: 0.1, defaultValue: 5, description: 'Vibrato frequency (Hz).' },
        { id: 'depth', name: 'Depth', type: 'slider', toneParam: { minValue: 0, maxValue: 1 }, step: 0.01, defaultValue: 0.1, description: 'Vibrato depth (0-1).' },
        { id: 'wet', name: 'Wet Mix', type: 'slider', toneParam: { minValue: 0, maxValue: 1 }, step: 0.01, defaultValue: 1, description: 'Wet/dry mix (0-1).' },
    ]),
    compactRendererId: 'DefaultCompactRenderer',
};

export class VibratoBlock extends Tone.Vibrato implements NativeBlock {
    readonly name: string = BLOCK_DEFINITION.name;

    public static getDefinition(): BlockDefinition {
        return BLOCK_DEFINITION;
    }

    public updateFromBlockInstance(instance: BlockInstance): void {
        if (!instance?.parameters) {
            console.warn(`[VibratoBlock updateFromBlockInstance ${instance?.instanceId || ''}] No parameters found in instance`, instance);
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
