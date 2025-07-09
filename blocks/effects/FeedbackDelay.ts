// Basic structure for FeedbackDelay
import * as Tone from 'tone';
import {
    BlockDefinition,
    BlockInstance,
    NativeBlock,
} from '@interfaces/block';
import { createParameterDefinitions } from '@constants/constants';

const BLOCK_DEFINITION: BlockDefinition = {
    id: 'tone-feedbackdelay-v1',
    name: 'FeedbackDelay',
    description: 'A Tone.js FeedbackDelay node.',
    category: 'effects',
    inputs: [
        { id: 'audio_in', name: 'Audio Input', type: 'audio', description: 'Connects to Tone.FeedbackDelay input.' },
    ],
    outputs: [
        { id: 'audio_out', name: 'Audio Output', type: 'audio', description: 'Output.' }
    ],
    parameters: createParameterDefinitions([
        { id: 'delayTime', name: 'Delay Time', type: 'slider', toneParam: { minValue: 0, maxValue: 1 }, step: 0.01, defaultValue: 0.25, description: 'The delay time in seconds.' },
        { id: 'feedback', name: 'Feedback', type: 'slider', toneParam: { minValue: 0, maxValue: 1 }, step: 0.01, defaultValue: 0.125, description: 'The feedback amount (0-1).' },
        { id: 'wet', name: 'Wet Mix', type: 'slider', toneParam: { minValue: 0, maxValue: 1 }, step: 0.01, defaultValue: 1, description: 'Wet/dry mix (0-1).' },
    ]),
    compactRendererId: 'DefaultCompactRenderer',
};

export class FeedbackDelayBlock extends Tone.FeedbackDelay implements NativeBlock {
    readonly name: string = BLOCK_DEFINITION.name;

    public static getDefinition(): BlockDefinition {
        return BLOCK_DEFINITION;
    }

    public updateFromBlockInstance(instance: BlockInstance): void {
        if (!instance?.parameters) {
            console.warn(`[FeedbackDelayBlock updateFromBlockInstance ${instance?.instanceId || ''}] No parameters found in instance`, instance);
            return;
        }

        const context = Tone.getContext();
        instance.parameters.forEach(param => {
            switch (param.id) {
                case 'delayTime':
                    if (this.delayTime.value !== Number(param.currentValue)) {
                        this.delayTime.setTargetAtTime(Number(param.currentValue), context.currentTime, 0.01);
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
