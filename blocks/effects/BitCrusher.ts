// Basic structure for BitCrusher
import * as Tone from 'tone';
import {
    BlockDefinition,
    BlockInstance,
    BlockParameter,
    NativeBlock,
} from '@interfaces/block';
import { createParameterDefinitions } from '@constants/constants';

const BLOCK_DEFINITION: BlockDefinition = {
    id: 'tone-bitcrusher-v1',
    name: 'BitCrusher',
    description: 'A Tone.js BitCrusher node.',
    category: 'effects',
    inputs: [
        { id: 'audio_in', name: 'Audio', type: 'audio', description: 'Connects to Tone.BitCrusher input.' },
        // TODO: Add CV inputs for parameters
    ],
    outputs: [
        { id: 'audio_out', name: 'Audio Out', type: 'audio', description: 'Output.' }
    ],
    parameters: createParameterDefinitions([
        { id: 'bits', name: 'Bits', type: 'slider', toneParam: { minValue: 1, maxValue: 16 }, step: 1, defaultValue: 4, description: 'Number of bits.' },
        { id: 'wet', name: 'Wet Mix', type: 'slider', toneParam: { minValue: 0, maxValue: 1 }, step: 0.01, defaultValue: 1, description: 'Wet/dry mix (0-1).' },
    ]),
    compactRendererId: 'DefaultCompactRenderer',
};

export class BitCrusherBlock extends Tone.BitCrusher implements NativeBlock {
    readonly name: string = BLOCK_DEFINITION.name;

    public static getDefinition(): BlockDefinition {
        return BLOCK_DEFINITION;
    }

    public updateFromBlockInstance(instance: BlockInstance): void {
        if (!instance?.parameters) {
            console.warn(`[BitCrusherBlock updateFromBlockInstance ${instance?.instanceId || ''}] No parameters found in instance`, instance);
            return;
        }

        const context = Tone.getContext();
        instance.parameters.forEach(param => {
            switch (param.id) {
                case 'bits':
                    if (this.bits !== Number(param.currentValue)) {
                        // For Tone.BitCrusher, 'bits' is a direct property, not a Param.
                        // However, the type definition in Tone.js might be Signal<number> or number.
                        // If it's a Signal, it should have a .value property.
                        // Checking the Tone.js documentation or source for BitCrusher is advised.
                        // Assuming it can be directly set or has a .value for simplicity here.
                        if (typeof this.bits === 'number') {
                             this.bits = Number(param.currentValue);
                        } else if (this.bits && typeof this.bits.value === 'number') {
                             this.bits.value = Number(param.currentValue);
                        }
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
