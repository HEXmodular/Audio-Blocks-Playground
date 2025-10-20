// Basic structure for Distortion
import * as Tone from 'tone';
import {
    BlockDefinition,
    BlockInstance,
    NativeBlock,
} from '@interfaces/block';
import { createParameterDefinitions } from '@constants/constants';

const BLOCK_DEFINITION: BlockDefinition = {
    id: 'tone-distortion-v1',
    name: 'Distortion',
    description: 'A Tone.js Distortion node.',
    category: 'effects',
    inputs: [
        { id: 'audio_in', name: 'Audio Input', type: 'audio', description: 'Connects to Tone.Distortion input.' },
    ],
    outputs: [
        { id: 'audio_out', name: 'Audio Out', type: 'audio', description: 'Output.' }
    ],
    parameters: createParameterDefinitions([
        { id: 'distortion', name: 'Distortion', type: 'slider', toneParam: { minValue: 0, maxValue: 1 }, step: 0.01, defaultValue: 0.4, description: 'The amount of distortion (0-1).' },
        { id: 'oversample', name: 'Oversample', type: 'select', options: [{value: 'none', label: 'None'}, {value: '2x', label: '2x'}, {value: '4x', label: '4x'}], defaultValue: 'none', description: 'The oversampling rate.' },
        { id: 'wet', name: 'Wet Mix', type: 'slider', toneParam: { minValue: 0, maxValue: 1 }, step: 0.01, defaultValue: 1, description: 'Wet/dry mix (0-1).' },
    ]),
    compactRendererId: 'DefaultCompactRenderer',
};

export class DistortionBlock extends Tone.Distortion implements NativeBlock {
    readonly name: string = BLOCK_DEFINITION.name;

    public static getDefinition(): BlockDefinition {
        return BLOCK_DEFINITION;
    }

    public updateFromBlockInstance(instance: BlockInstance): void {
        if (!instance?.parameters) {
            console.warn(`[DistortionBlock updateFromBlockInstance ${instance?.instanceId || ''}] No parameters found in instance`, instance);
            return;
        }

        const context = Tone.getContext();
        instance.parameters.forEach(param => {
            switch (param.id) {
                case 'distortion':
                    if (this.distortion !== Number(param.currentValue)) {
                        this.distortion = Number(param.currentValue);
                    }
                    break;
                case 'oversample':
                    if (this.oversample !== param.currentValue) {
                        this.oversample = param.currentValue as Tone.DistortionOptions['oversample'];
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
