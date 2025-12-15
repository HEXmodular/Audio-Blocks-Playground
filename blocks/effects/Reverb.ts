// Basic structure for Reverb
import * as Tone from 'tone';
import {
    BlockDefinition,
    BlockInstance,
    NativeBlock,
} from '@interfaces/block';
import { createParameterDefinitions } from '@constants/constants';

const BLOCK_DEFINITION: BlockDefinition = {
    id: 'tone-reverb-v1',
    name: 'Reverb',
    description: 'A Tone.js Reverb node.',
    category: 'effects',
    inputs: [
        { id: 'audio_in', name: 'Audio', type: 'audio', description: 'Connects to Tone.Reverb input.' },
    ],
    outputs: [
        { id: 'audio_out', name: 'Audio Out', type: 'audio', description: 'Output.' }
    ],
    parameters: createParameterDefinitions([
        { id: 'decay', name: 'Decay', type: 'slider', toneParam: { minValue: 0.001, maxValue: 10 }, step: 0.001, defaultValue: 1.5, description: 'Reverb decay time in seconds.' },
        { id: 'preDelay', name: 'PreDelay', type: 'slider', toneParam: { minValue: 0, maxValue: 1 }, step: 0.001, defaultValue: 0.01, description: 'Reverb pre-delay time in seconds.' },
        { id: 'wet', name: 'Wet Mix', type: 'slider', toneParam: { minValue: 0, maxValue: 1 }, step: 0.01, defaultValue: 0.5, description: 'Wet/dry mix (0-1).' },
    ]),
    compactRendererId: 'DefaultCompactRenderer',
};

export class ReverbBlock extends Tone.Reverb implements NativeBlock {
    readonly name: string = BLOCK_DEFINITION.name;

    public static getDefinition(): BlockDefinition {
        return BLOCK_DEFINITION;
    }

    public updateFromBlockInstance(instance: BlockInstance): void {
        if (!instance?.parameters) {
            console.warn(`[ReverbBlock updateFromBlockInstance ${instance?.instanceId || ''}] No parameters found in instance`, instance);
            return;
        }

        const context = Tone.getContext();
        instance.parameters.forEach(param => {
            switch (param.id) {
                case 'decay':
                    if (this.decay !== Number(param.currentValue)) {
                        this.decay = Number(param.currentValue);
                    }
                    break;
                case 'preDelay':
                    if (this.preDelay !== Number(param.currentValue)) {
                        this.preDelay = Number(param.currentValue);
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
