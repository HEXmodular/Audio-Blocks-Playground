// public/worklets/pcm-processor.js
const CHANN_COUNT = 4;

class PCMProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super(options);

        this.port.onmessage = (event) => {
            if (event.data === 'start') {
                this.t = 0; // Reset time when requested
                console.log("[PCMProcessor] Start.");
            }
        };
        console.log("[PCMProcessor] Initialized");
    }

    process(inputs) {
        let int16Buffer = new Int16Array(128 * CHANN_COUNT);
        if (inputs.length == 0) {
            return true; // Продолжать работу
        }
        // const float32Data = input[0]; // Первый канал (моно)
        for (let chann = 0; chann < CHANN_COUNT; chann++) {
            if (!inputs[chann]?.length) {
                continue;
            }
            const float32Data = inputs[chann][0];

            for (let i = 0; i < 128; i++) {
                let s = Math.max(-1, Math.min(1, float32Data[i]));
                int16Buffer[chann * 128 + i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                // int16Buffer[i] = s < 0 ? 0x8000 : 0x7FFF;
            }

        }

        // Отправляем готовый буфер в основной поток (к сокету)
        // console.log(int16Buffer);
        this.port.postMessage(int16Buffer);
        // this.port.postMessage(input[0]);
        return true; // Продолжать работу
    }
}

registerProcessor('pcm-processor', PCMProcessor);
