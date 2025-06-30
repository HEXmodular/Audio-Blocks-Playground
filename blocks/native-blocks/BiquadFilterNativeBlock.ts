import * as Tone from 'tone';
import { BlockDefinition, BlockInstance, BlockParameter, NativeBlock } from '@interfaces/block';
import { createParameterDefinitions } from '../../constants/constants';

// Options for the constructor
interface BiquadFilterNodeOptions extends Tone.ToneAudioNodeOptions {
    initialParams?: BlockParameter[];
    // Add instanceId to options if needed by the superclass or for logging
    instanceId?: string;
}

const BLOCK_DEFINITION: BlockDefinition = {
    id: 'tone-filter-v1',
    name: 'Filter (Tone)',
    description: 'A Tone.Filter node, providing various filter types.',
    inputs: [
        { id: 'audio_in', name: 'Audio Input', type: 'audio', description: 'Connects to Tone.Filter input.' },
        // For CV inputs, we need to ensure they are represented in the definition
        // if AudioGraphConnectorService relies on this for creating connections.
        // The getCvInput method will provide the actual Tone.Param/Signal.
        { id: 'freq_cv_in', name: 'Freq CV', type: 'audio', description: 'Modulates filter frequency.'},
        { id: 'q_cv_in', name: 'Q CV', type: 'audio', description: 'Modulates filter Q factor.'},
        { id: 'gain_cv_in', name: 'Gain CV', type: 'audio', description: 'Modulates filter gain.'}
    ],
    outputs: [
        { id: 'audio_out', name: 'Audio Output', type: 'audio', description: 'Output from Tone.Filter.' }
    ],
    parameters: createParameterDefinitions([
        { id: 'frequency', name: 'Frequency', type: 'slider', min: 20, max: 20000, step: 1, defaultValue: 350, description: 'Filter cutoff/center frequency in Hz.', isFrequency: true },
        { id: 'q', name: 'Q Factor', type: 'slider', min: 0.0001, max: 100, step: 0.0001, defaultValue: 1, description: 'Quality factor, controlling bandwidth.' },
        { id: 'gain', name: 'Gain (dB)', type: 'slider', min: -40, max: 40, step: 0.1, defaultValue: 0, description: 'Gain in decibels, for Peaking, Lowshelf, Highshelf filters.' },
        {
            id: 'type',
            name: 'Filter Type',
            type: 'select',
            options: [
                { value: "lowpass", label: "Lowpass" }, { value: "highpass", label: "Highpass" },
                { value: "bandpass", label: "Bandpass" }, { value: "notch", label: "Notch" },
                { value: "allpass", label: "Allpass" }, { value: "peaking", label: "Peaking" },
                { value: "lowshelf", label: "Lowshelf" }, { value: "highshelf", label: "Highshelf" }
            ],
            defaultValue: "lowpass",
            description: 'The type of filtering algorithm.'
        },
    ]),
    compactRendererId: 'DefaultCompactRenderer',
};

export class BiquadFilterNativeBlock extends Tone.Filter implements NativeBlock {
    readonly name: string = BLOCK_DEFINITION.name;
    // input is inherited from Tone.Filter and is Tone.Param<'frequency'>
    // output is inherited from Tone.Filter
    // We need to explicitly define input and output for NativeBlock interface compliance
    // if the inherited ones are not directly assignable or have different types.
    // However, Tone.Filter itself is a Tone.ToneAudioNode, so `this` can be input/output.
    // For clarity and to match the NativeBlock interface:
    readonly inputNode: Tone.ToneAudioNode;
    readonly outputNode: Tone.ToneAudioNode;


    constructor(options?: BiquadFilterNodeOptions) {
        const initialFrequency = options?.initialParams?.find(p => p.id === 'frequency')?.currentValue as number ??
            BLOCK_DEFINITION.parameters.find(p => p.id === 'frequency')?.defaultValue as number;
        const initialType = options?.initialParams?.find(p => p.id === 'type')?.currentValue as BiquadFilterType ??
            BLOCK_DEFINITION.parameters.find(p => p.id === 'type')?.defaultValue as BiquadFilterType;
        const initialQ = options?.initialParams?.find(p => p.id === 'q')?.currentValue as number ??
            BLOCK_DEFINITION.parameters.find(p => p.id === 'q')?.defaultValue as number;
        const initialGain = options?.initialParams?.find(p => p.id === 'gain')?.currentValue as number ??
            BLOCK_DEFINITION.parameters.find(p => p.id === 'gain')?.defaultValue as number;


        super({
            ...options,
            frequency: initialFrequency,
            type: initialType,
            Q: initialQ,
            gain: initialGain,
        });

        this.inputNode = this;
        this.outputNode = this;


        if (Tone.getContext().state !== 'running') {
            console.warn(`[BiquadFilterNativeBlock constructor ${options?.instanceId || ''}] Tone.js context is not running. Filter node may not function correctly.`);
        }

        // Apply all initial parameters, not just frequency and type
        // This ensures Q and Gain are also set correctly from the start.
        // Note: updateFromBlockInstance might be called by BlockStateManager after construction,
        // so this might be redundant if initialParams are part of the BlockInstance used there.
        // However, having it here ensures the node is correctly configured even if used standalone.
        if (options?.initialParams) {
            // Create a partial BlockInstance for updateFromBlockInstance
            const pseudoInstance: Partial<BlockInstance> = {
                parameters: options.initialParams,
                // instanceId: options.instanceId, // if needed for logging in updateFromBlockInstance
            };
            this.updateFromBlockInstance(pseudoInstance as BlockInstance);
        }
    }

    public static getDefinition(): BlockDefinition {
        return BLOCK_DEFINITION;
    }

    public updateFromBlockInstance(instance: BlockInstance): void {
        if (!instance?.parameters) {
            console.warn(`[BiquadFilterNativeBlock updateFromBlockInstance ${instance?.instanceId || ''}] No parameters found in instance`, instance);
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
                case 'q':
                    if (this.Q.value !== Number(param.currentValue)) {
                        this.Q.setTargetAtTime(Number(param.currentValue), context.currentTime, 0.01);
                    }
                    break;
                case 'gain':
                    if (this.gain.value !== Number(param.currentValue)) {
                        this.gain.setTargetAtTime(Number(param.currentValue), context.currentTime, 0.01);
                    }
                    break;
                case 'type':
                    if (this.type !== param.currentValue as string) {
                        this.type = param.currentValue as BiquadFilterType;
                    }
                    break;
            }
        });
    }

    // This method provides the Tone.js AudioParam or Signal for CV connection by AudioGraphConnectorService
    public getCvInputTarget(inputId: string): Tone.Param<any> | Tone.Signal<any> | undefined {
        switch (inputId) {
            case 'freq_cv_in':
                return this.frequency;
            case 'q_cv_in':
                return this.Q;
            case 'gain_cv_in':
                return this.gain; // This is Tone.Param<"decibels">
            default:
                console.warn(`[BiquadFilterNativeBlock] Unknown CV input ID for target: ${inputId}`);
                return undefined;
        }
    }
}
