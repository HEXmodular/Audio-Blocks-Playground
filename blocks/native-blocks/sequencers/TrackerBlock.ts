import { BlockDefinition, BlockInstance, BlockParameter, NativeBlock } from '@interfaces/block';
import { Emitter, ToneAudioNode, getTransport, Time } from 'tone';
import BlockStateManager from '@state/BlockStateManager';
import * as Tonal from 'tonal';
import { detect } from "@tonaljs/chord";
import { MusicRNN } from '@magenta/music/es6/music_rnn';

const DEFAULT_ROWS = 8;
const DEFAULT_COLS = 1;
const DEFAULT_DATA = Array.from({ length: DEFAULT_ROWS }, () => Array.from({ length: DEFAULT_COLS }, () => '..'));

const BLOCK_DEFINITION: BlockDefinition = {
    id: 'native-tracker-v1',
    name: 'Tracker',
    category: 'data',
    description: 'A simple tracker-style sequencer.',
    inputs: [
        { id: 'next', name: 'Next', type: 'trigger' },
        { id: 'reset', name: 'Reset', type: 'trigger' },
    ],
    outputs: [
        { id: 'note_out', name: 'Note Out', type: 'note' },
        { id: 'on_step', name: 'On Step', type: 'trigger' },
    ],
    parameters: [
        {
            id: 'rows',
            name: 'Rows',
            type: 'number_input',
            defaultValue: DEFAULT_ROWS,
            min: 1,
            max: 64,
        },
        {
            id: 'cols',
            name: 'Cols',
            type: 'number_input',
            defaultValue: DEFAULT_COLS,
            min: 1,
            max: 16,
        },
        {
            id: 'data',
            name: 'Data',
            type: 'internal', // Not directly editable, uses custom renderer
            defaultValue: DEFAULT_DATA,
        },
        {
            id: 'loop',
            name: 'Loop',
            type: 'toggle',
            defaultValue: false,
        },
        {
            id: 'loopPeriod',
            name: 'Loop Period',
            type: 'text_input',
            defaultValue: '8n',
        },
        {
            id: 'copyPattern',
            name: 'Copy Pattern',
            type: 'button',
        },
        {
            id: 'pastePattern',
            name: 'Paste Pattern',
            type: 'button',
        },

    ],
    compactRendererId: 'tracker',
};

const rnn = new MusicRNN(
    // 'https://storage.googleapis.com/download.magenta.tensorflow.org/tfjs_checkpoints/music_rnn/chord_pitches_improv'
    'https://storage.googleapis.com/download.magenta.tensorflow.org/tfjs_checkpoints/music_rnn/basic_rnn'
);

interface TrackerInternalState {
    activeRow: number;
}

export class TrackerBlock extends ToneAudioNode implements NativeBlock {
    readonly name: string = TrackerBlock.getDefinition().name;
    readonly input: undefined;
    readonly output: undefined;
    private _emitter = new Emitter();

    private _activeRow: number = 0;
    private _data: string[][] = DEFAULT_DATA;
    private _rows: number = DEFAULT_ROWS;
    private _cols: number = DEFAULT_COLS;
    private _loop: boolean = false;
    private _loopPeriod: string = '8n';
    private _transportEventId?: number;
    private _instanceId?: string;

    public static getDefinition(): BlockDefinition {
        return BLOCK_DEFINITION;
    }

    constructor() {
        super();
        this._emitter.on('next', () => this.handleTriggerIn());
        this._emitter.on('reset', () => this.handleResetIn());
        rnn?.initialize();
    }

    public emit(event: any, ...args: any[]) {
        this._emitter.emit(event, args?.[0]);
        return this;
    }

    public on(event: any, callback: (...args: any[]) => void) {
        this._emitter.on(event, callback);
        return this;
    }

    public updateFromBlockInstance(instance: BlockInstance): void {
        this._instanceId = instance.instanceId;
        this.updateParameters(instance.parameters);
        const state = instance.internalState as TrackerInternalState | undefined;
        if (state) {
            this._activeRow = state.activeRow;
        }
    }

    private updateParameters(parameters: BlockParameter[]): void {
        const dataParam = parameters.find(p => p.id === 'data');
        if (dataParam) {
            this._data = dataParam.currentValue;
        }

        const rowsParam = parameters.find(p => p.id === 'rows');
        if (rowsParam) {
            this._rows = rowsParam.currentValue;
        }

        const colsParam = parameters.find(p => p.id === 'cols');
        if (colsParam) {
            this._cols = colsParam.currentValue;
        }

        const loopParam = parameters.find(p => p.id === 'loop');
        if (loopParam) {
            this._loop = Boolean(loopParam.currentValue);
        }

        const loopPeriodParam = parameters.find(p => p.id === 'loopPeriod');
        if (loopPeriodParam?.currentValue !== this._loopPeriod || this._transportEventId === undefined) {
            this._loopPeriod = String(loopPeriodParam?.currentValue);
            const transport = getTransport();
            if (this._transportEventId !== undefined) {
                transport.clear(this._transportEventId);
            }
            if (this._loop) {
                this._transportEventId = transport.scheduleRepeat(time => {
                    this.handleTriggerIn(time);
                }, this._loopPeriod);
            }
        }

        const copyPatternParam = parameters.find(p => p.id === 'copyPattern');
        if (copyPatternParam) {
            console.log('copyPatternParam', copyPatternParam.currentValue);
            this.handleCopy();
        }

        const pastePatternParam = parameters.find(p => p.id === 'pastePattern');
        if (pastePatternParam) {
            console.log('pastePatternParam', pastePatternParam.currentValue);
            this.handlePaste();
        }
    }

    private handleCopy = () => {
        const gridString = JSON.stringify(this._data);
        navigator.clipboard.writeText(gridString);
    };

    private handlePaste = async () => {
        const text = await navigator.clipboard.readText();
        try {
            const newGrid = JSON.parse(text);
            if (
                !Array.isArray(newGrid) ||
                !newGrid.every((row) => Array.isArray(row))
            ) {
                return;
            }
            this._data = newGrid;
        } catch (error) {
            console.error('Failed to parse clipboard data:', error);
        }
    };

    private handleGenerate = async () => {
        let step = 1;
        const notes = this._data
            .flatMap((row, rowIndex) => row.map((cell, colIndex) => {
                const dur = 1;
                const note = {
                    pitch: Tonal.Note.midi(cell),
                    quantizedStartStep: step,
                    quantizedEndStep: step + dur
                };
                step += dur;
                return note;
            }))
            .filter(note => note.pitch !== null);

        const seedSeq = {
            totalQuantizedSteps: notes[notes.length - 1].quantizedEndStep,
            quantizationInfo: {
                stepsPerQuarter: 2
            },
            notes,
        };

        const chord = detect(notes.map(n => Tonal.Note.pc(Tonal.Note.fromMidi(n.pitch))));

        console.log(notes.map(n => Tonal.Note.pc(Tonal.Note.fromMidi(n.pitch))), chord)

        const genSeq = await rnn.continueSequenceAndReturnProbabilities(seedSeq, 8, 0.5)

        // if (!genSeq.notes) {
        //   return;
        // }
        console.log(genSeq);
        console.log(genSeq.probs.map(p => p.reduce((acc, curr) => acc > curr ? acc : curr, 0)));
        // TransportTime, ("4:3:2") will also provide tempo and time signature relative times in the form BARS:QUARTERS:SIXTEENTHS
        //   const part = new Tone.Part(((time, note) => {
        //     // the notes given as the second element in the array
        //     // will be passed in as the second argument
        //     synth.triggerAttackRelease(note, "8n", time);
        // }), [[0, "C2"], ["0:2", "C3"], ["0:3:2", "G2"]]).start(0);
        // const stepsPerQuarter = genSeq?.quantizationInfo?.stepsPerQuarter || 1;

        // const generatedSequence = genSeq.notes
        //   .filter(n => typeof n.quantizedStartStep === 'number')
        //   .map(n => ({
        //     time: { "4n": n.quantizedStartStep / stepsPerQuarter },
        //     note: n
        //   }));

        // const part = new Part(((time: number, note) => {
        //   // тут нужно тригерить ноту или отправлять парт в аутпут
        // }), generatedSequence).start(0);


        // generatedSequence = generatedSequence.concat(this.seqToTickArray(genSeq));
        // setTimeout(generateNext, generationIntervalTime * 1000);
        // });
        // }
        // };
    };

    public handleResetIn(time?: number): void {
        this._activeRow = 0;
        this.updateStateInBlockManager(time);
    }

    public handleTriggerIn(time?: number): void {
        // debugger;
        this._activeRow = (this._activeRow + 1) % this._rows;
        const currentRowData = this._data[this._activeRow];
        if (currentRowData) {
            currentRowData.forEach((note, colIndex) => {
                if (note && note !== '..') {
                    const noteData = { note, duration: '8n', time: time };
                    // Assuming one note output for simplicity for now
                    // In a real scenario, you might have multiple outputs or a different data structure
                    if (colIndex === 0) {
                        this._emitter.emit('note_out', noteData);
                    }
                }
            });
        }

        this._emitter.emit('on_step', true);
        this.updateStateInBlockManager(time);
    }

    private updateStateInBlockManager(time?: number) {
        if (this._instanceId) {
            const internalState: TrackerInternalState = { activeRow: this._activeRow };
            // console.log('[TrackerBlock] updateStateInBlockManager', internalState);
            BlockStateManager.updateBlockInstance(this._instanceId, { internalState });
        }
    }

    public dispose(): void {
        super.dispose();
        if (this._transportEventId !== undefined) {
            getTransport().clear(this._transportEventId);
        }
        this._emitter.dispose();
    }
}
