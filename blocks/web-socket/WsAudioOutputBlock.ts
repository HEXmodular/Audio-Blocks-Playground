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
const WS_BUFFER_SIZE = UPSCALE * 256; // x2 bytes on send
const WEB_AUDIO_API_BUFFER_SIZE = 256; // Int16 size = Float32 * 2
const CHANN_COUNT = 4;

const WS_URL = 'ws://192.168.4.1:81/ws';


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
    private _gain1 = new Tone.Gain();
    private _gain2 = new Tone.Gain();
    private _gain3 = new Tone.Gain();
    private _gain4 = new Tone.Gain();
    input: Tone.ToneAudioNode[] = [this._gain1, this._gain2, this._gain3, this._gain4];
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
            // numberOfInputs: 1,
            // numberOfOutputs: 1,
            // outputChannelCount:  [2],
            // ot

        });

        // Слушаем сообщения из ворклета и шлем в сокет
        workletNode.port.onmessage = (event) => {
            if (this.socket.readyState === WebSocket.OPEN) {
                // event.data — это уже готовый ArrayBuffer (Int16)
                // console.log(event);

                const int16Buf = event.data;

                const wsBuffer = new Int16Array(UPSCALE * int16Buf[0].length * CHANN_COUNT * 2);
                // console.log("int16Buf wsBuffer", int16Buf.length, wsBuffer.length)

                for (let i = 0; i < CHANN_COUNT; i++) {
                    wsBuffer.set(int16Buf[i], i * WS_BUFFER_SIZE); //+ this.wsBufferOffset);
                }
                // this.wsBuffer.set(event.data, this.wsBufferOffset);


                this.wsBufferOffset += WEB_AUDIO_API_BUFFER_SIZE;

                if (this.wsBufferOffset > WS_BUFFER_SIZE) {
                    // console.log("Буфер заполнен");
                    // return;
                    this.socket.send(wsBuffer.buffer);//this.wsBuffer);
                    // console.log(this.wsBuffer);

                    this.wsBufferOffset = 0;
                }
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
            // const osc = new Tone.Oscillator(2);
            // const gain = new Tone.Gain(1);
            // osc.connect(gain);
            // gain.connect(workletNode);
            // // osc.connect(workletNode);
            // osc.type = "sine"
            // osc.start();
            this.input.connect(workletNode);
            // workletNode.connect(this.output);
            workletNode?.port.postMessage('start'); // Notify worklet to start processing on transport start
        })

        // // this.input
        // new Tone.Oscillator(440).connect(workletNode);
        // workletNode.connect(this.output);

        // workletNode?.port.postMessage('start'); // Notify worklet to start processing on transport start




        // workletNode.connect(this.output.input.context.destination);


        // .connect();
        // Tone.connect(this.input, workletNode);
        // Uncaught (in promise) InvalidAccessError

        // Важно: AudioWorkletNode нужно подключить к destination, 
        // чтобы он начал "качать" данные, даже если звук не нужен в динамиках
        // const internalGain = new Tone.Gain(1)
        // Tone.connect(workletNode, internalGain);
        // workletNode.connect(internalGain.input.)
        // workletNode.connect(internalGain);
    }

    constructor(options?: WsAudioOutputNodeOptions) {
        super(options);

        if (Tone.getContext().state !== 'running') {
            console.warn(`[WsAudioOutputBlock constructor] Tone.js context is not running. Audio Output may not function correctly.`);
        }

        this.socket.binaryType = 'arraybuffer'; // Важно для передачи бинарных данных


        this.setupAudio();

        // const internalGain = new Tone.Gain(1)
        // internalGain.connect(Tone.getDestination());
        // this.input = internalGain;//Tone.getDestination(); // Assign internal gain to the input proxy

    }

    public static getDefinition(): BlockDefinition {
        return BLOCK_DEFINITION;
    }

    // This method will be adapted from the old updateNodeParams
    public updateFromBlockInstance(instance: BlockInstance): void {
    }
}
