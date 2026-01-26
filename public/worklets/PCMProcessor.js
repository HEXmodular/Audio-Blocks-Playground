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
        const input = inputs[0]; // Получаем входной поток
        const int16Buffer = [];
        if (input.length > 0) {
            // const float32Data = input[0]; // Первый канал (моно)
            for (let chann = 0; chann < CHANN_COUNT; chann++) {
                const float32Data = inputs[chann];
                int16Buffer[chann] = new Int16Array(float32Data.length);

                for (let i = 0; i < input[chann].length; i++) {
                    let s = Math.max(-1, Math.min(1, float32Data[i]));
                    int16Buffer[chann][i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                    // int16Buffer[i] = s < 0 ? 0x8000 : 0x7FFF;
                }
            }

            // Отправляем готовый буфер в основной поток (к сокету)
            this.port.postMessage(int16Buffer.buffer);
            // this.port.postMessage(input[0]);
        }
        return true; // Продолжать работу
    }
}

registerProcessor('pcm-processor', PCMProcessor);
