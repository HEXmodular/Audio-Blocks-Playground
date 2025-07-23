const MIN_NOTE = 48;
const MAX_NOTE = 84;



let temperature = 1.1;
let patternLength = 8;

// Using the Improv RNN pretrained model from https://github.com/tensorflow/magenta/tree/master/magenta/models/improv_rnn
let rnn = new mm.MusicRNN(
  'https://storage.googleapis.com/download.magenta.tensorflow.org/tfjs_checkpoints/music_rnn/chord_pitches_improv'
);


let currentSeed = [];
let stopCurrentSequenceGenerator;
let pulsePattern = true;
let currentPlayFn;
let tick = 0;

let activeOutput = 'internal';

function isAccidental(note) {
  let pc = note % 12;
  return pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10;
}



function detectChord(notes) {
  notes = notes.map(n => Tonal.Note.pc(Tonal.Note.fromMidi(n.note))).sort();
  return Tonal.PcSet.modes(notes)
    .map((mode, i) => {
      const tonic = Tonal.Note.name(notes[i]);
      const names = Tonal.Dictionary.chord.names(mode);
      return names.length ? tonic + names[0] : null;
    })
    .filter(x => x);
}

function buildNoteSequence(seed) {
  let step = 0;
  let delayProb = pulsePattern ? 0 : 0.3;
  let notes = seed.map(n => {
    let dur = 1 + (Math.random() < delayProb ? 1 : 0);
    let note = {
      pitch: n.note,
      quantizedStartStep: step,
      quantizedEndStep: step + dur
    };
    step += dur;
    return note;
  });
  return {
    totalQuantizedSteps: _.last(notes).quantizedEndStep,
    quantizationInfo: {
      stepsPerQuarter: 1
    },
    notes
  };
}

function seqToTickArray(seq) {
  return _.flatMap(seq.notes, n =>
    [n.pitch].concat(
      pulsePattern
        ? []
        : _.times(n.quantizedEndStep - n.quantizedStartStep - 1, () => null)
    )
  );
}

function doTick(time = Tone.now() - Tone.context.lookAhead) {
  applyHumanKeyChanges(time);
  if (currentPlayFn) currentPlayFn(time);
}

function startSequenceGenerator(seed) {
  let running = true,
    thisPatternLength = patternLength;

  let chords = detectChord(seed);
  let chord =
    _.first(chords) ||
    Tonal.Note.pc(Tonal.Note.fromMidi(_.first(seed).note)) + 'M';
  let seedSeq = buildNoteSequence(seed);
  let generatedSequence = seqToTickArray(seedSeq);
  let playIntervalTime = Tone.Time('8n').toSeconds();
  let generationIntervalTime = playIntervalTime / 2;
  function generateNext() {
    if (!running) return;
    if (generatedSequence.length < thisPatternLength) {
      rnn.continueSequence(seedSeq, 20, temperature, [chord]).then(genSeq => {
        generatedSequence = generatedSequence.concat(seqToTickArray(genSeq));
        setTimeout(generateNext, generationIntervalTime * 1000);
      });
    }
  }

  tick = 0;
  currentPlayFn = function playNext(time) {
    let tickInSeq = tick % thisPatternLength;
    if (tickInSeq < generatedSequence.length) {
      let note = generatedSequence[tickInSeq];
      if (note) machineKeyDown(note, time);
    }
    tick++;
  };

  setTimeout(generateNext, 0);

  return () => {
    running = false;
    currentPlayFn = null;
  };
}

function updateChord({ add = [], remove = [] }) {
  for (let note of add) {
    currentSeed.push({ note, time: Tone.now() });
  }
  for (let note of remove) {
    _.remove(currentSeed, { note });
  }

  if (stopCurrentSequenceGenerator) {
    stopCurrentSequenceGenerator();
    stopCurrentSequenceGenerator = null;
  }
  if (currentSeed.length) {
    stopCurrentSequenceGenerator = startSequenceGenerator(
      _.cloneDeep(currentSeed)
    );
  }
}

let humanKeyAdds = [],
  humanKeyRemovals = [];
function humanKeyDown(note, velocity = 0.7) {
  if (note < MIN_NOTE || note > MAX_NOTE) return;
  humanKeyAdds.push({ note, velocity });
}
function humanKeyUp(note) {
  if (note < MIN_NOTE || note > MAX_NOTE) return;
  humanKeyRemovals.push({ note });
}
function applyHumanKeyChanges(time = Tone.now()) {
  if (humanKeyAdds.length == 0 && humanKeyRemovals.length == 0) return;
  for (let { note, velocity } of humanKeyAdds) {
    outputs[activeOutput].play(note, velocity, time, true);
    humanPlayer[note - MIN_NOTE].classList.add('down');
    animatePlay(onScreenKeyboard[note - MIN_NOTE], note, true);
  }
  for (let { note } of humanKeyRemovals) {
    outputs[activeOutput].stop(note, time);
    humanPlayer[note - MIN_NOTE].classList.remove('down');
  }
  updateChord({
    add: humanKeyAdds.map(n => n.note),
    remove: humanKeyRemovals.map(n => n.note)
  });
  humanKeyAdds.length = 0;
  humanKeyRemovals.length = 0;
}


// control
temperature = 0.5;
patternLength = 8;
pulsePattern = true;

// Startup

function generateDummySequence() {
  // Generate a throwaway sequence to get the RNN loaded so it doesn't
  // cause jank later.
  return rnn.continueSequence(
    buildNoteSequence([{ note: 60, time: Tone.now() }]),
    20,
    temperature,
    ['Cm']
  );
}

let bufferLoadPromise = new Promise(res => Tone.Buffer.on('load', res));
Promise.all([bufferLoadPromise, rnn.initialize()])
  .then(generateDummySequence)

