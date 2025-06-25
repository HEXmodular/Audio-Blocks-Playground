// public/worklets/ByteBeatProcessor.js
class ByteBeatProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    this.t = 0;
    this.formula = "t&t>>8";
    this.sampleRate = 8000; // Fixed sample rate

    this.port.onmessage = (event) => {
      if (event.data.formula) {
        this.formula = event.data.formula;
        // Reset time on formula change to avoid unexpected sounds, or make this configurable
        // this.t = 0;
        console.log(`[ByteBeatProcessor] Formula updated to: ${this.formula}`);
      }
      if (event.data.sampleRate) {
        // This is for future flexibility, but current requirement is fixed 8000Hz
        // console.warn("[ByteBeatProcessor] Sample rate changes are not fully supported yet through port messages for this version.");
      }
    };
    console.log("[ByteBeatProcessor] Initialized with formula:", this.formula, "and sample rate:", this.sampleRate);
    // currentSampleRate is defined by the AudioContext, but we operate at a fixed 8000Hz for bytebeat logic
  }

  static get parameterDescriptors() {
    return [{ name: 'formula', defaultValue: "", automationRate: 'k-rate' }]; 
    // No AudioParams, formula is passed via processorOptions or port message
  }

  // static get parameterDescriptors() {
  //   return [{ name: 'pan', defaultValue: 0, minValue: -1, maxValue: 1, automationRate: 'k-rate' }];
  // }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const outputChannel = output[0];
    // this.formula = parameters.formula || this.formula;
    // const formula = parameters.formula[0];
    // console.log("[ByteBeatProcessor] Processing with formula:", parameters);

    // Determine the actual sample rate of the AudioContext
    // This is important if the AudioContext is not running at 8000Hz,
    // as we need to adapt our fixed 8000Hz bytebeat output.
    const audioContextSampleRate = sampleRate; // sampleRate is a global variable in AudioWorkletProcessor scope

    // Calculate how many bytebeat ticks (at 8000Hz) correspond to one frame at the AudioContext's sample rate.
    // This is essentially a resampling step.
    const step = 8000 / audioContextSampleRate;

    if (!this.formula || typeof this.formula !== 'string') {
      console.warn("[ByteBeatProcessor] Invalid or missing formula. Outputting silence.");
      for (let i = 0; i < outputChannel.length; i++) {
        outputChannel[i] = 0;
      }
      return true;
    }

    try {
      // This is a critical part: the bytebeat formula is evaluated directly.
      // This can be a security risk if the formula string is not sanitized
      // or comes from an untrusted source. For a controlled environment, it's common.
      // Consider sandboxing or a safer evaluation method for production systems.
      const formulaFn = new Function('t', `return ${this.formula}`);

      for (let i = 0; i < outputChannel.length; i++) {
        // Evaluate the formula at the current time `this.t`
        // The result is typically a byte (0-255), so we scale it to the -1 to 1 range for audio.
        const value = formulaFn(this.t);
        outputChannel[i] = (value & 0xFF) / 128.0 - 1.0;

        // Increment time `t` based on the 8000Hz fixed rate, adapted for the current block processing.
        this.t += step;
      }
    } catch (e) {
      console.error(`[ByteBeatProcessor] Error evaluating formula: "${this.formula}"`, e);
      // Output silence in case of an error
      for (let i = 0; i < outputChannel.length; i++) {
        outputChannel[i] = 0;
      }
      // Optionally, post a message back to the main thread about the error
      // this.port.postMessage({ error: e.toString(), formula: this.formula });
      return true; // Continue processing
    }

    return true; // Keep processor alive
  }
}

registerProcessor('byte-beat-processor', ByteBeatProcessor);
