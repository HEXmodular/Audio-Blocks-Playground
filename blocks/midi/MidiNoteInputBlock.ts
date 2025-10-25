import { Emitter, Signal, Midi } from 'tone';
import { WebMidi } from 'webmidi';
import { BlockDefinition, BlockInstance } from '@interfaces/block';
import { createParameterDefinitions } from '@constants/constants';
import BlockStateManager from '@state/BlockStateManager';

const DEFAULT_MIDI_DEVICE = null;

const BLOCK_DEFINITION: BlockDefinition = {
    id: 'midi-note-input-v1',
    name: 'MIDI Note Input',
    category: 'i/o',
    description: 'Receives MIDI Note On/Off messages and outputs their value.',
    inputs: [],
    outputs: [
        { id: 'note_out', name: 'Note Out', type: 'note', description: 'The Note value.' },
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
            id: 'midiChannel',
            name: 'MIDI Channel',
            type: 'number_input',
            defaultValue: 1,
            description: 'The MIDI channel to listen to.'
        },
    ]),
};

export class MidiNoteInputBlock extends Signal {
    readonly name = BLOCK_DEFINITION.name;

    private _instanceId: string | null = null;
    private _midiChannel: number;
    private _midiDevice: string;
    private _listener: any;

    private _emitter = new Emitter();

    constructor() {
        super();
        this._midiChannel = BLOCK_DEFINITION.parameters.find(p => p.id === 'midiChannel')?.defaultValue as number;
        this._midiDevice = BLOCK_DEFINITION.parameters.find(p => p.id === 'midiDevice')?.defaultValue as string;

    }

    public emit(event: any, ...args: any[]) {
        this._emitter.emit(event, args?.[0]);
        return this;
    }

    public on(event: any, callback: (...args: any[]) => void) {
        this._emitter.on(event, callback);
        return this;
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
            this._listener = input.addListener('noteon', e => {
                if (e.message.channel !== this._midiChannel) return
                this.emit('note_out', { noteOn: true, note: e.note.identifier });
                this.value = e.note.number;
            });
            this._listener = input.addListener('noteoff', e => {
                if (e.message.channel !== this._midiChannel) return
                this.emit('note_out', { noteOn: false, note: e.note.identifier });
                this.value = e.note.number;
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
            const midiChannelParam = instance.parameters.find(p => p.id === 'midiChannel');


            if (midiChannelParam) {
                this._midiChannel = Number(midiChannelParam.currentValue);
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
