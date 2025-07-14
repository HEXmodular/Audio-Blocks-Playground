import { PianoGenie } from '@magenta/music/es6/piano_genie';
import { BlockDefinition, BlockInstance, NativeBlock, WithEmitter } from '@interfaces/block'; // Added BlockParameter
import { createParameterDefinitions } from '@constants/constants';
import { ToneAudioNode, Signal, Midi } from 'tone';

// TODO: Determine if the checkpoint URL should be configurable or if this is standard.
const CHECKPOINT_URL = 'https://storage.googleapis.com/magentadata/js/checkpoints/piano_genie/model/epiano/stp_iq_auto_contour_dt_166006';

const BLOCK_DEFINITION: BlockDefinition = {
    id: 'magenta-piano-genie-v1',
    name: 'Piano Genie',
    category: 'ai',
    description: 'Generates melodies using Magenta.js Piano Genie.',
    inputs: [
        { id: 'sequence', name: 'Sequence', type: 'string', description: 'Input sequence (comma-separated numbers for keyList).' },
        { id: 'button', name: 'Button', type: 'number', description: 'Input "note" in one octave (number from 0 to 11).' },
        { id: 'trigger', name: 'Trigger', type: 'trigger', description: 'Triggers the generation of the next note.' },
        { id: 'reset', name: 'Reset', type: 'trigger', description: 'Resets the Piano Genie state.' },
    ],
    outputs: [
        { id: 'next_note', name: 'Next Note', type: 'number', description: 'The generated next note.' },
    ],
    parameters: createParameterDefinitions([
        {
            id: 'temperature', name: 'Temperature', type: 'slider',
            defaultValue: 0.5,
            toneParam: { minValue: 0.1, maxValue: 1.0 },
            step: 0.01,
            description: 'Controls randomness in generation.'
        },
        {
            id: 'seed', name: 'Seed', type: 'number_input', // Assuming 'number' type maps to a numerical input field
            defaultValue: -1, // -1 might signify a random seed or to not use a seed if PianoGenie handles it internally
            description: 'Seed for randomness (-1 for random/default).'
        },
        // {
        //     id: 'button', name: 'Button', type: 'slider', // Or 'number' if slider isn't appropriate
        //     defaultValue: 0,
        //     toneParam: {minValue: 0, maxValue: 7},
        //     step: 1, // Piano Genie typically uses 8 buttons (0-7)
        //     description: 'Piano Genie button to press (0-7).'
        // }
    ]),
    //   compactRendererId: 'piano-genie', // Optional: if a custom compact renderer is needed
};

export class PianoGenieBlock extends WithEmitter implements Partial<ToneAudioNode>, NativeBlock {
    name = BLOCK_DEFINITION.name;
    input = undefined; // PianoGenie doesn't process audio through Tone.js standard signal chain
    output = undefined; // Output is via emitter

    private _genie: PianoGenie;
    //   emit = new Emitter().emit;
    private _currentTemperature: number;
    private _currentSeed: number | undefined;
    private _currentButton: number;
    // private _currentSequenceString: string;
    private _isGenieInitialized: boolean = false;
    // private _gateSubscriptions: Emitter<string>[] = [];
    button: Signal;

    constructor() {
        super();
        this._genie = new PianoGenie(CHECKPOINT_URL);
        this._genie.initialize().then(() => {
            this._isGenieInitialized = true;
            console.log('Piano Genie instance in block initialized');
        }).catch(err => {
            console.error('Error initializing Piano Genie instance in block:', err);
        });

        // this._outputEmitter = new Emitter();
        this._currentTemperature = BLOCK_DEFINITION.parameters.find(p => p.id === 'temperature')?.defaultValue as number;
        const seedParam = BLOCK_DEFINITION.parameters.find(p => p.id === 'seed');
        this._currentSeed = seedParam?.defaultValue === -1 ? undefined : seedParam?.defaultValue as number;
        this._currentButton = BLOCK_DEFINITION.parameters.find(p => p.id === 'button')?.defaultValue as number;
        this._currentSequenceString = ''; // Initialize sequence string

        this.button = new Signal({
            value: this._currentButton,
            units: 'number',
            minValue: 0,
            maxValue: 11,
        });

        // для обработки входящих гейтов/тригеров
        this._emitter.on('gate_change', (payload) => {
            // console.log("[Piano Genie] Gate input received.", payload);
            payload && this.onTrigger();
        })

        this._emitter.on('trigger', (payload) => {
            // console.log("[Piano Genie] Gate input received.", payload);
            this.onTrigger();
        })

        this._emitter.on('button', (payload) => {
            // console.log("[Piano Genie] Button input received.", payload);
            this.button.value = payload;
        })
    }

    public static getDefinition(): BlockDefinition {
        return BLOCK_DEFINITION;
    }

    // Method to handle incoming trigger
    public onTrigger(): void {
        if (!this._isGenieInitialized) { // Use internal flag
            console.warn('Piano Genie not initialized, cannot generate note.');
            return;
        }
        try {

            const keyList = [36, 38, 40, 41, 43, 45, 47].map(n => n+12);
            //   this._currentSequenceString.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
            if (keyList.length === 0) {
                console.warn('No valid sequence provided to Piano Genie.');
                // Potentially emit a default or error value, or do nothing
                return;
            }
            // console.log("[PianoGenieBlock] button", this.button.value);
            const nextNote: number = this._genie.nextFromKeyList(this.button.value, keyList, this._currentTemperature, this._currentSeed);
            const frequencyDirect = new Midi(nextNote+12).toFrequency();
            console.log(nextNote)
            this.emit('next_note', frequencyDirect);
        } catch (error) {
            console.error('Error generating note from Piano Genie:', error);
        }
    }

    // Method to handle incoming reset
    public onReset(): void {
        if (!this._isGenieInitialized) { // Use internal flag
            console.warn('Piano Genie not initialized, cannot reset.');
            return;
        }
        this._genie.resetState();
        console.log('Piano Genie state reset.');
    }

    public updateFromBlockInstance(instance: BlockInstance): void {
        if (instance.parameters) {
            const tempParam = instance.parameters.find(p => p.id === 'temperature');
            if (tempParam) {
                this._currentTemperature = Number(tempParam.currentValue);
            }

            const seedParam = instance.parameters.find(p => p.id === 'seed');
            if (seedParam) {
                const seedVal = Number(seedParam.currentValue);
                this._currentSeed = seedVal === -1 ? undefined : seedVal;
            }

            const buttonParam = instance.parameters.find(p => p.id === 'button');
            if (buttonParam) {
                this._currentButton = Number(buttonParam.currentValue);
            }
        }
        return
    }

    // dispose method to clean up
    dispose() {
        super.dispose();
        this._emitter.dispose();
        // No specific dispose for PianoGenie instance itself in the library,
        // but good practice to nullify if it held significant resources directly.
        // this._genie = null; // if necessary
        return this;
    }
}
