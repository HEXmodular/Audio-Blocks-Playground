
import { Emitter, Midi, Part, Signal } from 'tone';
import { BlockDefinition, BlockInstance, NativeBlock } from '@interfaces/block';
import { createParameterDefinitions } from '@constants/constants';
import { MusicRNN } from '@magenta/music/es6/music_rnn';

import * as Tonal from 'tonal';

// "C4", "4n"
const BLOCK_DEFINITION: BlockDefinition = {
  id: 'neural-arpeggiator-v1',
  name: 'Neural Arpeggiator',
  description: 'Generates a musical sequence based on a seed chord.',
  category: 'ai',
  inputs: [
    { id: 'chord', name: 'Chord', type: 'string', description: 'Chord. For example: Cm, F#m7.' },
    // { id: 'duration', name: 'Duration', type: 'string', description: 'Duration in Tone.js format. For example: 4n, 8n.' },
    { id: 'frequency_string', name: 'Frequency String', type: 'string', description: 'Frequency in Tone.js format. For example: F#4, 440.' },
  ],
  outputs: [
    { id: 'output', name: 'Output', type: 'audio', description: 'The generated signal.' }
  ],
  parameters: createParameterDefinitions([
    {
      id: 'temperature', name: 'Temperature', type: 'slider',
      toneParam: { minValue: 0.1, maxValue: 2.0 }, step: 0.1,
      defaultValue: 1.1, description: 'Controls the randomness of the generated sequence.'
    },
    {
      id: 'patternLength', name: 'Pattern Length', type: 'slider',
      toneParam: { minValue: 4, maxValue: 16 }, step: 1,
      defaultValue: 8, description: 'The length of the generated musical pattern.'
    },
    {
      id: 'pulsePattern', name: 'Pulse Pattern', type: 'toggle',
      defaultValue: true,
      description: 'Pulse pattern.'
    },
  ]),
};



export class NeuralArpeggiatorBlock implements NativeBlock {
  readonly name: string = BLOCK_DEFINITION.name;
  private _emitter = new Emitter();
  output = new Signal(0);

  private rnn: MusicRNN;
  private currentSeed: { note: number, time: number }[] = [];
  private humanKeyAdds: { note: number, time?: number }[] = [];
  private humanKeyRemovals: { note: number, time?: number }[] = [];
  private stopCurrentSequenceGenerator: (() => void) | null = null;
  private currentPlayFn: ((time: number) => void) | null = null;
  private tick = 0;
  private temperature = 1.1;
  private patternLength = 8;
  private pulsePattern = true;

  constructor() {
    this.rnn = new MusicRNN(
      'https://storage.googleapis.com/download.magenta.tensorflow.org/tfjs_checkpoints/music_rnn/chord_pitches_improv'
    );
    this.initialize();

    this._emitter.on('frequency_string', (data) => {
      // TODO вход должен быть вместе с длительностью ноты, чтобы понимать когда удалять
      this.humanKeyAdds.push({ note: Midi(data).toMidi() });
      this.updateChord({
        add: this.humanKeyAdds.map(n => n.note),
        remove: this.humanKeyRemovals.map(n => n.note)
      });
    });
  }

  private async initialize() {
    await this.rnn.initialize();
    this.generateDummySequence();
  }

  public static getDefinition(): BlockDefinition {
    return BLOCK_DEFINITION;
  }

  public on(event: any, callback: (...args: any[]) => void) {
    this._emitter.on(event, callback);
    return this;
  }

  public emit(event: any, ...args: any[]) {
    this._emitter.emit(event, args?.[0]);
    return this;
  }

  public updateFromBlockInstance(instance: BlockInstance): void {
    if (!instance?.parameters) {
      return;
    }

    if (!instance.lastChanges) {
      return;
    }

    const changedParameters = instance.lastChanges.parameters;

    if (changedParameters) {
      const temperatureParam = changedParameters.find(p => p.id === 'temperature');
      const patternLengthParam = changedParameters.find(p => p.id === 'patternLength');
      const pulsePatternParam = changedParameters.find(p => p.id === 'pulsePattern');

      if (temperatureParam) this.temperature = Number(temperatureParam.currentValue);
      if (patternLengthParam) this.patternLength = Number(patternLengthParam.currentValue);
      if (pulsePatternParam) this.pulsePattern = pulsePatternParam.currentValue === 'true';
    }
  }

  private doTick(time: number) {
    if (this.currentPlayFn) this.currentPlayFn(time);
  }

  private startSequenceGenerator(seed: { note: number, time: number }[]) {
    let running = true;
    const thisPatternLength = this.patternLength;

    const chords = this.detectChord(seed);
    const chord =
      chords[0] ||
      Tonal.Note.pc(Tonal.Note.fromMidi(seed[0].note)) + 'M';
    const seedSeq = this.buildNoteSequence(seed);
    // let generatedSequence = this.seqToTickArray(seedSeq);
    // const playIntervalTime = 0.125; // 8n
    // const generationIntervalTime = playIntervalTime / 2;

    const generateNext = () => {
      if (!running) return;
      // if (generatedSequence.length < thisPatternLength) {
      
      // на вход может приходить: 
      // Part (без аккорда)
      // аккорд текстом  (если его нет, нужно определить из Part)

      this.rnn.continueSequence(seedSeq, 20, this.temperature, [chord])
        .then(genSeq => {
          if (!genSeq.notes) {
            return;
          }
          // TransportTime, ("4:3:2") will also provide tempo and time signature relative times in the form BARS:QUARTERS:SIXTEENTHS
          //   const part = new Tone.Part(((time, note) => {
          //     // the notes given as the second element in the array
          //     // will be passed in as the second argument
          //     synth.triggerAttackRelease(note, "8n", time);
          // }), [[0, "C2"], ["0:2", "C3"], ["0:3:2", "G2"]]).start(0);
          const stepsPerQuarter = genSeq?.quantizationInfo?.stepsPerQuarter || 1;

          const generatedSequence = genSeq.notes
            .filter(n => typeof n.quantizedStartStep === 'number')
            .map(n => ({
              time: { "4n": n.quantizedStartStep / stepsPerQuarter },
              note: n
            }));

          const part = new Part(((time: number, note) => {
            // тут нужно тригерить ноту или отправлять парт в аутпут
          }), generatedSequence).start(0);


          // generatedSequence = generatedSequence.concat(this.seqToTickArray(genSeq));
          // setTimeout(generateNext, generationIntervalTime * 1000);
        });
      // }
    };

    // this.tick = 0;
    // this.currentPlayFn = (time) => {
    //   const tickInSeq = this.tick % thisPatternLength;
    //   if (tickInSeq < generatedSequence.length) {
    //     const note = generatedSequence[tickInSeq];
    //     if (note) {
    //       this.output.value = note;
    //     }
    //   }
    //   this.tick++;
    // };

    // setTimeout(generateNext, 0);

    // return () => {
    //   running = false;
    //   this.currentPlayFn = null;
    // };
  }

  private updateChord({ add = [], remove = [] }: { add?: number[], remove?: number[] }) {
    for (const note of add) {
      this.currentSeed.push({ note, time: Date.now() });
    }
    for (const note of remove) {
      this.currentSeed = this.currentSeed.filter(n => n.note !== note);
    }

    // if (this.stopCurrentSequenceGenerator) {
    //   this.stopCurrentSequenceGenerator();
    //   this.stopCurrentSequenceGenerator = null;
    // }
    // if (this.currentSeed.length) {
    //   this.stopCurrentSequenceGenerator = this.startSequenceGenerator(
    //     [...this.currentSeed]
    //   );
    // }
  }

  private detectChord(notes: { note: number }[]) {
    const pcs = notes.map(n => Tonal.Note.pc(Tonal.Note.fromMidi(n.note))).sort();
    return Tonal.PcSet.modes(pcs)
      .map((mode, i) => {
        const tonic = Tonal.Note.name(pcs[i]);
        const names = Tonal.Dictionary.chord.names(mode);
        return names.length ? tonic + names[0] : null;
      })
      .filter(x => x);
  }

  private buildNoteSequence(seed: { note: number }[]) {
    let step = 0;
    const delayProb = this.pulsePattern ? 0 : 0.3;
    const notes = seed.map(n => {
      const dur = 1 + (Math.random() < delayProb ? 1 : 0);
      const note = {
        pitch: n.note,
        quantizedStartStep: step,
        quantizedEndStep: step + dur
      };
      step += dur;
      return note;
    });
    return {
      totalQuantizedSteps: notes[notes.length - 1].quantizedEndStep,
      quantizationInfo: {
        stepsPerQuarter: 1
      },
      notes
    };
  }

  // private seqToTickArray(seq: mm.INoteSequence) {
  //   return seq.notes.flatMap(n =>
  //     [n.pitch].concat(
  //       this.pulsePattern
  //         ? []
  //         : Array(n.quantizedEndStep - n.quantizedStartStep - 1).fill(null)
  //     )
  //   );
  // }

  private generateDummySequence() {
    console.log(this.buildNoteSequence([{ note: 60 }]))
    const seq = this.rnn.continueSequence(
      this.buildNoteSequence([{ note: 60 }]),
      20,
      this.temperature,
      ['Cm']
    ).then(noteSeq => {
      console.log(noteSeq)
      debugger
    });
    return seq;
  }

  public dispose() {
    if (this.stopCurrentSequenceGenerator) {
      this.stopCurrentSequenceGenerator();
    }
    this._emitter.dispose();
  }
}
