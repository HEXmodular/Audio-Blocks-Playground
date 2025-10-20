// Basic structure for Phaser
import * as Tone from 'tone';
import {
    BlockDefinition,
    BlockInstance,
    NativeBlock,
} from '@interfaces/block';
import { createParameterDefinitions } from '@constants/constants';

const BLOCK_DEFINITION: BlockDefinition = {
    id: 'tone-phaser-v1',
    name: 'Phaser',
    description: 'A Tone.js Phaser node.',
    category: 'effects',
    inputs: [
        { id: 'audio_in', name: 'Audio Input', type: 'audio', description: 'Connects to Tone.Phaser input.' },
    ],
    outputs: [
        { id: 'audio_out', name: 'Audio Out', type: 'audio', description: 'Output.' }
    ],
    parameters: createParameterDefinitions([
        { id: 'frequency', name: 'Frequency', type: 'slider', toneParam: { minValue: 0, maxValue: 20 }, step: 0.1, defaultValue: 0.5, description: 'The speed of the phasing effect.' },
        { id: 'octaves', name: 'Octaves', type: 'slider', toneParam: { minValue: 0, maxValue: 10 }, step: 0.1, defaultValue: 3, description: 'The number of octaves the phase sweeps.' },
        { id: 'stages', name: 'Stages', type: 'slider', toneParam: { minValue: 0, maxValue: 10 }, step: 1, defaultValue: 10, description: 'The number of filter stages.' },
        { id: 'Q', name: 'Q', type: 'slider', toneParam: { minValue: 0, maxValue: 20 }, step: 0.1, defaultValue: 10, description: 'The Q of the filter.' },
        { id: 'baseFrequency', name: 'Base Frequency', type: 'slider', toneParam: { minValue: 20, maxValue: 20000 }, step: 1, defaultValue: 350, description: 'The base frequency of the filters.' },
        { id: 'wet', name: 'Wet Mix', type: 'slider', toneParam: { minValue: 0, maxValue: 1 }, step: 0.01, defaultValue: 1, description: 'Wet/dry mix (0-1).' },
    ]),
    compactRendererId: 'DefaultCompactRenderer',
};

export class PhaserBlock extends Tone.Phaser implements NativeBlock {
    readonly name: string = BLOCK_DEFINITION.name;

    public static getDefinition(): BlockDefinition {
        return BLOCK_DEFINITION;
    }

    public updateFromBlockInstance(instance: BlockInstance): void {
        if (!instance?.parameters) {
            console.warn(`[PhaserBlock updateFromBlockInstance ${instance?.instanceId || ''}] No parameters found in instance`, instance);
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
                case 'octaves':
                    if (this.octaves !== Number(param.currentValue)) {
                        this.octaves = Number(param.currentValue);
                    }
                    break;
                case 'stages':
                    if (this.stages !== Number(param.currentValue)) {
                        // TODO: Tone.Phaser.stages is read-only. This parameter should be set in the constructor.
                        // Consider removing this parameter or finding another way to update it.
                        console.warn('[PhaserBlock] The "stages" parameter is read-only and cannot be updated after initialization.');
                    }
                    break;
                case 'Q':
                    if (this.Q.value !== Number(param.currentValue)) {
                        this.Q.setTargetAtTime(Number(param.currentValue), context.currentTime, 0.01);
                    }
                    break;
                case 'baseFrequency':
                    if (this.baseFrequency !== Number(param.currentValue)) {
                        this.baseFrequency = Number(param.currentValue);
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
