import React, { useState, useEffect, useMemo } from 'react';
import { MusicRNN } from '@magenta/music/es6/music_rnn';
import * as Tonal from 'tonal';
import { detect } from "@tonaljs/chord";


interface TrackerControlProps {
  rows: number;
  cols: number;
  data?: string[][];
  onDataChange?: (data: string[][]) => void;
  activeRow?: number;
}

const TrackerControl: React.FC<TrackerControlProps> = ({
  rows,
  cols,
  data,
  onDataChange,
  activeRow,
}) => {
  const [grid, setGrid] = useState<string[][]>([]);

  const rnn = useMemo(() => new MusicRNN(
    // 'https://storage.googleapis.com/download.magenta.tensorflow.org/tfjs_checkpoints/music_rnn/chord_pitches_improv'
    'https://storage.googleapis.com/download.magenta.tensorflow.org/tfjs_checkpoints/music_rnn/basic_rnn'
  ), []);

  useEffect(() => {
    rnn?.initialize();
  }, [rnn]);

  useEffect(() => {
    const newGrid = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => {
        return data?.[r]?.[c] || '..';
      })
    );
    setGrid(newGrid);
  }, [rows, cols, data]);

  const handleNoteChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    rowIndex: number,
    colIndex: number
  ) => {
    const newGrid = grid.map((row, rIdx) => {
      if (rIdx === rowIndex) {
        return row.map((cell, cIdx) => {
          if (cIdx === colIndex) {
            return e.target.value;
          }
          return cell;
        });
      }
      return row;
    });
    setGrid(newGrid);
    if (onDataChange) {
      onDataChange(newGrid);
    }
  };

  const handleCopy = () => {
    const gridString = JSON.stringify(grid);
    navigator.clipboard.writeText(gridString);
  };

  const handlePaste = async () => {
    const text = await navigator.clipboard.readText();
    try {
      const newGrid = JSON.parse(text);
      if (
        !Array.isArray(newGrid) ||
        !newGrid.every((row) => Array.isArray(row))
      ) {
        return;
      }
      setGrid(newGrid);
      if (onDataChange) {
        onDataChange(newGrid);
      }

    } catch (error) {
      console.error('Failed to parse clipboard data:', error);
    }
  };

  const handleGenerate = async () => {
    let step = 1;
    const notes = grid
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
    console.log(genSeq.probs.map(p => p.reduce((acc, curr) => acc > curr ? acc : curr , 0)));
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

  const styles: { [key: string]: React.CSSProperties } = {
    container: {
      fontFamily: 'monospace',
      display: 'inline-block',
      border: '1px solid #ccc',
      padding: '10px',
    },
    table: {
      borderCollapse: 'collapse',
    },
    cell: {
      border: '1px solid #eee',
      padding: '0',
    },
    activeCell: {
      backgroundColor: '#d3e3ff',
    },
    input: {
      width: '50px',
      height: '25px',
      textAlign: 'center',
      border: 'none',
      background: 'transparent',
      fontFamily: 'monospace',
    },
    button: {
      margin: '5px',
      padding: '5px 10px',
      fontFamily: 'monospace',
    },
  };

  return (
    <div style={styles.container}>
      <div>
        <button onClick={handleCopy} style={styles.button}>
          Copy
        </button>
        <button onClick={handlePaste} style={styles.button}>
          Paste
        </button>
        <button onClick={handleGenerate} style={styles.button}>
          Generate
        </button>
      </div>
      {grid.map((row, rowIndex) => (
        <>
          {row.map((cell, colIndex) => (
            <div
              key={colIndex}
              style={{
                ...styles.cell,
                ...(rowIndex === activeRow ? styles.activeCell : {}),
              }}
            >
              <input
                type="text"
                value={cell}
                onChange={(e) => handleNoteChange(e, rowIndex, colIndex)}
                style={styles.input}
              />
            </div>
          ))}
        </>
      ))}
    </div>
  );
};

export default TrackerControl;
