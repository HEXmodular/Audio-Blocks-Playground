import * as Tone from 'tone';
import {
    BlockDefinition,
    BlockInstance,
    NativeBlock,
} from '@interfaces/block';

// Options for the constructor, similar to ByteBeatPlayer
interface WsAudioOutputNodeOptions extends Tone.ToneAudioNodeOptions {
}

const UPSCALE = 1;


const WS_URL = 'http://192.168.4.1/ws';


const BLOCK_DEFINITION: BlockDefinition = {
    id: 'ws-audio-output-v1',
    name: 'Wifi Audio Out',
    category: 'i/o',
    description: 'Outputs to wi-fi the incoming audio signal.',
    inputs: [
        { id: 'audio_in_1', name: 'Audio', type: 'audio', portIndex: 0, description: 'Signal to websocket output.' },
        { id: 'audio_in_2', name: 'Audio', type: 'audio', portIndex: 1, description: 'Signal to websocket output.' },
        { id: 'audio_in_3', name: 'Audio', type: 'audio', portIndex: 2, description: 'Signal to websocket output.' },
        { id: 'audio_in_4', name: 'Audio', type: 'audio', portIndex: 3, description: 'Signal to websocket output.' },
        // { id: 'volume_cv_in', name: 'Volume CV', type: 'audio', description: 'Modulates output volume.', audioParamTarget: 'volume' }
    ],
    outputs: [],
    parameters: [],
};

//TODO нужно корректно реализовать подключение каналов с первого по четвертый
export class WsAudioOutputBlock extends Tone.ToneAudioNode implements NativeBlock {
    readonly name: string = BLOCK_DEFINITION.name; // Keep name consistent
    // private wsBuffer = new Int16Array(WS_BUFFER_SIZE * CHANN_COUNT);
    private _workletNode: AudioWorkletNode | undefined;

    input: [
        { input: this._workletNode, index: 0 },
        { input: this._workletNode, index: 1 },
        { input: this._workletNode, index: 2 },
        { input: this._workletNode, index: 3 }
    ]
    output: Tone.OutputNode | undefined;
    get numberOfInputs(): number {
        return 4;
    }
    get numberOfOutputs(): number {
        return 0;
    }

    private wsBufferOffset = 0;
    // Input is the internalGain node
    // readonly input: Tone.ToneAudioNode;
    // readonly output: undefined;

    // readonly socket = new WebSocket('ws://192.168.4.1:81/ws');

    private socket = new WebSocket(WS_URL);

    // readonly scriptNode = this.context.rawContext.createScriptProcessor(256, 1, 1);

    async setupAudio() {
        //new (window.AudioContext || (window as any).webkitAudioContext)();
        const context = Tone.getContext();

        // await context.audioWorklet.addModule('worklets/PCMProcessor.js');

        // const workletNode = new AudioWorkletNode(context, 'pcm-processor');
        await context.addAudioWorkletModule('worklets/PCMProcessor.js');

        const workletNode = context.createAudioWorkletNode('pcm-processor', {
            numberOfInputs: 4,
            numberOfOutputs: 0,
            // outputChannelCount:  [2],
            // ot
        });

        this._workletNode = workletNode;

        // Слушаем сообщения из ворклета и шлем в сокет
        workletNode.port.onmessage = (event) => {
            // console.log(event);
            if (this.socket.readyState === WebSocket.OPEN) {
                // event.data — это уже готовый ArrayBuffer (Int16)
                const int16Buf = event.data;

                    this.socket.send(int16Buf);//this.wsBuffer);

            } else if (this.socket.readyState === WebSocket.CLOSED) {
                this.socket = new WebSocket(WS_URL);
            }
        };

        workletNode.onprocessorerror = (error) => {
            console.error("[WsAudioOutputBlock] Processor error:", error);
        }

        Tone.getTransport().on('stop', () => {
            workletNode?.disconnect(); // Disconnect worklet node on transport stop
        })
        Tone.getTransport().on('start', () => {
            const osc = new Tone.Oscillator(2);
            osc.connect(workletNode);
            // osc.connect(workletNode, 0, 1);
            // osc.connect(workletNode, 0, 2);
            // osc.connect(workletNode, 0, 3);
            osc.type = "sine"
            osc.start();

            // workletNode.connect(gain1.input)
            
            // this.input.connect(workletNode);

            // workletNode.connect(this.output);
            workletNode?.port.postMessage('start'); // Notify worklet to start processing on transport start
        })
    }

    constructor(options?: Partial<Tone.ToneAudioNodeOptions>) {
        super(options);
        console.log(this);

        if (Tone.getContext().state !== 'running') {
            console.warn(`[WsAudioOutputBlock constructor] Tone.js context is not running. Audio Output may not function correctly.`);
        }

        this.socket.binaryType = 'arraybuffer'; // Важно для передачи бинарных данных


        this.setupAudio();
    }

    public static getDefinition(): BlockDefinition {
        return BLOCK_DEFINITION;
    }

    // This method will be adapted from the old updateNodeParams
    public updateFromBlockInstance(instance: BlockInstance): void {
    }
}
