// Basic structure for Chebyshev
import * as Tone from 'tone';
import {
    BlockDefinition,
    BlockInstance,
    BlockParameter,
    NativeBlock,
} from '@interfaces/block';
import { createParameterDefinitions } from '@constants/constants';

const BLOCK_DEFINITION: BlockDefinition = {
    id: 'tone-chebyshev-v1',
    name: 'Chebyshev',
    description: 'A Tone.js Chebyshev waveshaper node.',
    category: 'effect', // Or distortion?
    inputs: [
        { id: 'audio_in', name: 'Audio Input', type: 'audio', description: 'Connects to Tone.Chebyshev input.' },
        // TODO: Add CV inputs for parameters
    ],
    outputs: [
        { id: 'audio_out', name: 'Audio Output', type: 'audio', description: 'Output.' }
    ],
    parameters: createParameterDefinitions([
        { id: 'order', name: 'Order', type: 'slider', toneParam: { minValue: 1, maxValue: 100 }, step: 1, defaultValue: 1, description: 'Chebyshev polynomial order.' },
        { id: 'wet', name: 'Wet Mix', type: 'slider', toneParam: { minValue: 0, maxValue: 1 }, step: 0.01, defaultValue: 1, description: 'Wet/dry mix (0-1).' },
    ]),
    compactRendererId: 'DefaultCompactRenderer',
};

export class ChebyshevBlock extends Tone.Chebyshev implements NativeBlock {
    readonly name: string = BLOCK_DEFINITION.name;

    public static getDefinition(): BlockDefinition {
        return BLOCK_DEFINITION;
    }

    public updateFromBlockInstance(instance: BlockInstance): void {
        if (!instance?.parameters) {
            console.warn(`[ChebyshevBlock updateFromBlockInstance ${instance?.instanceId || ''}] No parameters found in instance`, instance);
            return;
        }

        const context = Tone.getContext();
        instance.parameters.forEach(param => {
            switch (param.id) {
                case 'order':
                    if (this.order !== Number(param.currentValue)) {
                        this.order = Number(param.currentValue);
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
