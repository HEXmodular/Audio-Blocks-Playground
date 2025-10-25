import { Emitter, Signal } from 'tone';
import { WebMidi } from 'webmidi';
import { BlockDefinition, BlockInstance } from '@interfaces/block';
import { createParameterDefinitions } from '@constants/constants';
import BlockStateManager from '@state/BlockStateManager';

const DEFAULT_MIDI_DEVICE = null;

const BLOCK_DEFINITION: BlockDefinition = {
    id: 'midi-cc-input-v1',
    name: 'MIDI CC Input',
    category: 'i/o',
    description: 'Receives MIDI CC messages and outputs their value.',
    inputs: [],
    outputs: [
        { id: 'value', name: 'Value', type: 'сс', description: 'The CC value.' },
    ],
    parameters: createParameterDefinitions([
        {
            id: 'midiDevice',
            name: 'MIDI Device',
            type: 'select',
            defaultValue: DEFAULT_MIDI_DEVICE,
            options: [], // This will be populated dynamically
            getOptionsAsync: async () => {
                await WebMidi.enable()
                return WebMidi.inputs ?
                    WebMidi.inputs.map(input => ({
                        value: input.id,
                        label: input.name,
                    }))
                    : [{ value: "", label: "" }];
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

export class MidiCcInputBlock extends Signal {
    readonly name = BLOCK_DEFINITION.name;

    private _instanceId: string | null = null;
    private _ccNumber: number;
    private _midiDevice: string;
    private _listener: any;

    private emitter = new Emitter();

    constructor() {
        super();
        this._ccNumber = BLOCK_DEFINITION.parameters.find(p => p.id === 'ccNumber')?.defaultValue as number;
        this._midiDevice = BLOCK_DEFINITION.parameters.find(p => p.id === 'midiDevice')?.defaultValue as string;

    }

    public static getDefinition(): BlockDefinition {
        const definition = { ...BLOCK_DEFINITION };
        if (WebMidi.enabled) {
            const midiDeviceParam = definition.parameters.find(p => p.id === 'midiDevice');
            if (midiDeviceParam) {
                midiDeviceParam.options = WebMidi.inputs.map(input => ({
                    value: input.id,
                    label: input.name,
                }));
            }
        }
        return definition;
    }

    private enableMidi() {
        WebMidi.enable()
            .then(() => {
                if (!WebMidi.inputs.length) {
                    return
                }
                if (this._midiDevice === DEFAULT_MIDI_DEVICE && this._instanceId !== null) {
                    this._midiDevice = WebMidi.inputs[0].id;
                    BlockStateManager.updateBlockInstanceParameter(this._instanceId, 'midiDevice', this._midiDevice);
                }
                this.setupControlChangeListener();
            })
            .catch(err => {
                console.error('WebMidi could not be enabled.', err);
            });
    }

    private setupControlChangeListener() {
        const input = WebMidi.getInputById(this._midiDevice);
        if (input) {
            this._listener = input.addListener('controlchange', e => {
                if (e.controller.number === this._ccNumber) {
                    this.emitter.emit ('value', e.value);
                    this.value = Number(e.value);
                }
            });
        }
    }

    public updateFromBlockInstance(instance: BlockInstance): void {
        if (!instance.instanceId) {
            return
        }

        this._instanceId = instance.instanceId;
        this.enableMidi();

        if (instance.parameters) {

            const midiDeviceParam = instance.parameters.find(p => p.id === 'midiDevice');
            const ccNumberParam = instance.parameters.find(p => p.id === 'ccNumber');


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
