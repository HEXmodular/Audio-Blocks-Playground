import * as Tone from 'tone';
import { getTransport } from 'tone';
import {
    BlockDefinition,
    BlockInstance,
    NativeBlock,
} from '@interfaces/block';

const WS_URL = 'http://192.168.4.1/ws';

const BLOCK_DEFINITION: BlockDefinition = {
    id: 'ws-audio-output-v1',
    name: 'Wifi Audio',
    category: 'i/o',
    description: 'Outputs to wi-fi the incoming audio signal.',
    inputs: [
        { id: 'audio_in_1', name: 'Audio 1', type: 'audio', portIndex: 0, description: 'Signal to websocket output.' },
        { id: 'audio_in_2', name: 'Audio 2', type: 'audio', portIndex: 1, description: 'Signal to websocket output.' },
        { id: 'audio_in_3', name: 'Audio 3', type: 'audio', portIndex: 2, description: 'Signal to websocket output.' },
        { id: 'audio_in_4', name: 'Audio 4', type: 'audio', portIndex: 3, description: 'Signal to websocket output.' },
        // { id: 'volume_cv_in', name: 'Volume CV', type: 'audio', description: 'Modulates output volume.', audioParamTarget: 'volume' }
    ],
    outputs: [
        { id: 'audio_out_1', name: 'Audio 1', type: 'audio', portIndex: 0, description: 'Signal to websocket input.' },
        { id: 'audio_out_2', name: 'Audio 2', type: 'audio', portIndex: 1, description: 'Signal to websocket input.' },
        { id: 'audio_out_3', name: 'Audio 3', type: 'audio', portIndex: 2, description: 'Signal to websocket input.' },
        { id: 'audio_out_4', name: 'Audio 4', type: 'audio', portIndex: 3, description: 'Signal to websocket input.' },
    ],
    parameters: [],
};
//TODO нужно корректно реализовать подключение каналов с первого по четвертый
export class WsAudioOutputBlock extends Tone.ToneAudioNode implements NativeBlock {
    readonly name: string = BLOCK_DEFINITION.name; // Keep name consistent

    input = new Tone.Merge(4);
    outputMerge = new Tone.Merge(4)
    output = this.outputMerge.connect(new Tone.Split(4));
    players = Array(4).map((_, index) => new Tone.Player().connect(this.outputMerge, index, index)); // toDestination();

    private nextPlayTimes = Array(4).fill(0); // time of next scheduled play

    get numberOfInputs(): number {
        return 4;
    }
    get numberOfOutputs(): number {
        return 0;
    }

    private socket = new WebSocket(WS_URL);

    async setupAudio() {
        const context = Tone.getContext();

        await context.addAudioWorkletModule('worklets/PCMProcessor.js');

        const workletNode = context.createAudioWorkletNode('pcm-processor', {
            numberOfInputs: 4,
            numberOfOutputs: 0,
        });

        // Слушаем сообщения из ворклета и шлем в сокет
        workletNode.port.onmessage = (event) => {
            if (this.socket.readyState === WebSocket.OPEN) {
                const int16Buf = event.data;

                this.socket.send(int16Buf);

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
            const split = new Tone.Split(4);
            this.input.connect(split);

            split.connect(workletNode, 0, 0);
            split.connect(workletNode, 1, 1);
            split.connect(workletNode, 2, 2);
            split.connect(workletNode, 3, 3);
        })


        this.socket.onmessage = (event) => {
            console.log("this.socket.onmessage");
            const int8Array = new Int8Array(event.data);
            const float32Arrays = Array(4).fill(new Float32Array(int8Array.length / 4));

            const buffLen = int8Array.length / 4;
            const toneBuffers = Array(4); 

            for (let j = 0; j < 4; j++) {
                for (let i = 0; i < buffLen / 4; i++) {
                    float32Arrays[j][i] = (int8Array[j * buffLen + i] - 127) / 128; // Для Int8 нормализация на 128
                }

                toneBuffers[j] = new Tone.ToneAudioBuffer().fromArray(float32Arrays[j]);
                // bufferQueue.push(toneBuffer);

                // Рассчитываем время старта: сразу после предыдущего звука
                // или сейчас, если очередь пуста.
                const startTime = Math.max(Tone.now(), this.nextPlayTimes[j]);

                // Планируем событие на транспорте
                getTransport().scheduleOnce((time: number) => {
                    this.players[j].buffer = toneBuffers[j];
                    this.players[j].start(time);
                }, startTime);

                // Обновляем время конца очереди
                this.nextPlayTimes[j] = startTime + toneBuffers[j].duration;
            }
        };
    }

    constructor(options?: Partial<Tone.ToneAudioNodeOptions>) {
        super(options);

        if (Tone.getContext().state !== 'running') {
            console.warn(`[WsAudioOutputBlock constructor] Tone.js context is not running. Audioput may not function correctly.`);
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
