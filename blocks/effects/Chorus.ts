// Basic structure for Chorus
import * as Tone from 'tone';
import {
    BlockDefinition,
    BlockInstance,
    BlockParameter,
    NativeBlock,
} from '@interfaces/block';
import { createParameterDefinitions } from '@constants/constants';

const BLOCK_DEFINITION: BlockDefinition = {
    id: 'tone-chorus-v1',
    name: 'Chorus',
    description: 'A Tone.js Chorus node.',
    category: 'effects',
    inputs: [
        { id: 'audio_in', name: 'Audio', type: 'audio', description: 'Connects to Tone.Chorus input.' },
        // TODO: Add CV inputs for parameters
    ],
    outputs: [
        { id: 'audio_out', name: 'Audio Out', type: 'audio', description: 'Output.' }
    ],
    parameters: createParameterDefinitions([
        { id: 'frequency', name: 'Frequency', type: 'slider', toneParam: { minValue: 0.1, maxValue: 10 }, step: 0.1, defaultValue: 1.5, description: 'LFO frequency.' },
        { id: 'delayTime', name: 'Delay Time (ms)', type: 'slider', toneParam: { minValue: 1, maxValue: 100 }, step: 1, defaultValue: 3.5, description: 'Chorus delay time.' },
        { id: 'depth', name: 'Depth', type: 'slider', toneParam: { minValue: 0, maxValue: 1 }, step: 0.01, defaultValue: 0.7, description: 'Chorus depth.' },
        { id: 'feedback', name: 'Feedback', type: 'slider', toneParam: { minValue: 0, maxValue: 1 }, step: 0.01, defaultValue: 0.1, description: 'Chorus feedback.' },
        { id: 'wet', name: 'Wet Mix', type: 'slider', toneParam: { minValue: 0, maxValue: 1 }, step: 0.01, defaultValue: 1, description: 'Wet/dry mix (0-1).' },
    ]),
    compactRendererId: 'DefaultCompactRenderer',
};

export class ChorusBlock extends Tone.Chorus implements NativeBlock {
    readonly name: string = BLOCK_DEFINITION.name;

    public static getDefinition(): BlockDefinition {
        return BLOCK_DEFINITION;
    }

    public updateFromBlockInstance(instance: BlockInstance): void {
        if (!instance?.parameters) {
            console.warn(`[ChorusBlock updateFromBlockInstance ${instance?.instanceId || ''}] No parameters found in instance`, instance);
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
                case 'delayTime':
                    if (this.delayTime !== Number(param.currentValue)) {
                        this.delayTime = Number(param.currentValue);
                    }
                    break;
                case 'depth':
                    if (this.depth !== Number(param.currentValue)) {
                        this.depth = Number(param.currentValue);
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
