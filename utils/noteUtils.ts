
export const A4_FREQ = 440;
const NOTE_OFFSETS: { [key: string]: number } = {
  'c': -9, 'c#': -8, 'db': -8, 'd': -7, 'd#': -6, 'eb': -6,
  'e': -5, 'f': -4, 'f#': -3, 'gb': -3, 'g': -2, 'g#': -1, 'ab': -1,
  'a': 0, 'a#': 1, 'bb': 1, 'b': 2,
};

/**
 * Parses a note string (e.g., "A4", "C#3", "Bb5") into its corresponding frequency in Hz.
 * @param noteString The note string to parse.
 * @returns The frequency in Hz, or null if parsing fails.
 */
export function parseNoteStringToFrequency(noteString: string): number | null {
  if (typeof noteString !== 'string') return null;
  const normalizedNote = noteString.trim().toLowerCase();

  // Regex to capture note name (a-g), accidental (# or b, optional), and octave (0-8)
  const noteRegex = /^([a-g])([#b]?)([0-8])$/;
  const match = normalizedNote.match(noteRegex);

  if (!match) return null;

  const [, noteName, accidental, octaveStr] = match;
  const octave = parseInt(octaveStr, 10);

  const key = `${noteName}${accidental}`;
  if (!(key in NOTE_OFFSETS)) {
    return null;
  }

  const semitonesFromA0InOctave0 = NOTE_OFFSETS[key]; 
  const semitonesFromA4 = semitonesFromA0InOctave0 + (octave - 4) * 12;

  const frequency = A4_FREQ * Math.pow(2, semitonesFromA4 / 12);
  return Math.round(frequency * 100) / 100; // Round to 2 decimal places
}


/**
 * Parses an input (string or number) into a frequency.
 * If the input is a string, it first tries to parse it as a number.
 * If that fails, it tries to parse it as a musical note string (e.g., "A4").
 * @param input The string or number to parse.
 * @returns The frequency in Hz, or null if parsing fails.
 */
export function parseFrequencyInput(input: string | number): number | null {
  if (typeof input === 'number') {
    return isNaN(input) || !isFinite(input) ? null : input;
  }
  if (typeof input === 'string') {
    const trimmedInput = input.trim();
    if (trimmedInput === "") return null;

    const numericValue = parseFloat(trimmedInput);
    if (!isNaN(numericValue) && isFinite(numericValue)) {
      // Check if the string was purely numeric (e.g. "440") or had units (e.g. "440hz")
      // For this implementation, if it starts with a number and parseFloat works, we use it.
      // More sophisticated unit stripping could be added if needed.
      if (String(numericValue) === trimmedInput || String(Math.round(numericValue)) === trimmedInput || String(numericValue.toFixed(1)) === trimmedInput || String(numericValue.toFixed(2)) === trimmedInput ) {
         return numericValue;
      }
    }
    return parseNoteStringToFrequency(trimmedInput);
  }
  return null;
}
