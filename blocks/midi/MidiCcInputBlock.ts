
import { BlockDefinition, BlockInstance, NativeBlock, WithEmitter } from '@interfaces/block';
import { createParameterDefinitions } from '@constants/constants';
import { Midi } from 'tone';
import { WebMidi } from 'webmidi';
import BlockStateManager from '@state/BlockStateManager';

const BLOCK_DEFINITION: BlockDefinition = {
    id: 'midi-cc-input-v1',
    name: 'MIDI CC Input',
    category: 'i/o',
    description: 'Receives MIDI CC messages and outputs their value.',
    inputs: [],
    outputs: [
        { id: 'value', name: 'Value', type: 'number', description: 'The CC value.' },
    ],
    parameters: createParameterDefinitions([
        {
            id: 'midiDevice',
            name: 'MIDI Device',
            type: 'select',
            defaultValue: 'default',
            options: [], // This will be populated dynamically
            getOptionsAsync: async () => {
                await WebMidi.enable()
                return WebMidi.inputs.map(input => ({
                    value: input.id,
                    label: input.name,
                }));
            },
            description: 'The MIDI input device.'
        },
        {
            id: 'ccNumber',
            name: 'CC Number',
            type: 'number_input',
            defaultValue: 1,
            description: 'The MIDI CC number to listen to.'
        },
    ]),
};

export class MidiCcInputBlock extends WithEmitter implements NativeBlock {
    name = BLOCK_DEFINITION.name;
    input = undefined;
    output = undefined;

    private _ccNumber: number;
    private _midiDevice: string;
    private _listener: any;

    constructor() {
        super();
        this._ccNumber = BLOCK_DEFINITION.parameters.find(p => p.id === 'ccNumber')?.defaultValue as number;
        this._midiDevice = BLOCK_DEFINITION.parameters.find(p => p.id === 'midiDevice')?.defaultValue as string;
        this.enableMidi();
    }

    public static getDefinition(): BlockDefinition {
        const definition = { ...BLOCK_DEFINITION };
        console.log("👩‍🦳 [MidiCcInputBlock] definition", definition);
        if (WebMidi.enabled) {
            const midiDeviceParam = definition.parameters.find(p => p.id === 'midiDevice');
            console.log("👩‍🦳 [MidiCcInputBlock] midiDeviceParam", midiDeviceParam);
            if (midiDeviceParam) {
                console.log("👩‍🦳 [MidiCcInputBlock] WebMidi.inputs", WebMidi.inputs);
                midiDeviceParam.options = WebMidi.inputs.map(input => ({
                    value: input.id,
                    label: input.name,
                }));
            }
        }
        return definition;
    }

    private enableMidi() {
        if (WebMidi.enabled) {
            this.setupControlChangeListener();
        } else {
            WebMidi.enable()
                .then(() => {
                    console.log('WebMidi enabled');
                    // console.log("👩‍🦳 [MidiCcInputBlock] WebMidi.inputs", WebMidi.inputs);
                    this.setupControlChangeListener();
                })
                .catch(err => {
                    console.error('WebMidi could not be enabled.', err);
                });
        }
    }

    private setupControlChangeListener() {
        const input = WebMidi.getInputById(this._midiDevice);
        if (input) {
            this._listener = input.addListener('controlchange', e => {
                if (e.controller.number === this._ccNumber) {
                    this.emit('value', e.value);
                }
            });
        }
    }

    public updateFromBlockInstance(instance: BlockInstance): void {
        if (instance.parameters) {

            const midiDeviceParam = instance.parameters.find(p => p.id === 'midiDevice');
            const ccNumberParam = instance.parameters.find(p => p.id === 'ccNumber');

            // if (WebMidi.enabled) {

            //     const currentMidiDevices = WebMidi.inputs.map(input => ({
            //         value: input.id,
            //         label: input.name,
            //     }))
            //     const previousMidiDevices = midiDeviceParam?.options
            //     debugger
            //     if (JSON.stringify(previousMidiDevices) !== JSON.stringify(currentMidiDevices)) {
            //         BlockStateManager.updateBlockInstance(instance.instanceId, {
            //             parameters: [ccNumberParam,
            //             {
            //                 ...midiDeviceParam,
            //                 options: currentMidiDevices
            //             }]
            //         });
            //     }
            // }

            if (ccNumberParam) {
                this._ccNumber = Number(ccNumberParam.currentValue);
            }

            // const midiDeviceParam = instance.parameters.find(p => p.id === 'midiDevice');
            if (midiDeviceParam) {
                const newDevice = midiDeviceParam.currentValue as string;
                if (newDevice !== this._midiDevice) {
                    const oldInput = WebMidi.getInputById(this._midiDevice);
                    if (oldInput && this._listener) {
                        oldInput.removeListener('controlchange', this._listener);
                    }
                    this._midiDevice = newDevice;
                    this.setupControlChangeListener();
                }
            }
        }
    }

    dispose() {
        super.dispose();
        const input = WebMidi.getInputById(this._midiDevice);
        if (input && this._listener) {
            input.removeListener('controlchange', this._listener);
        }
        return this;
    }
}
