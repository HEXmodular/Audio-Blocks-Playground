import { PianoGenie } from '@magenta/music/es6/piano_genie'

const checkpoint = 'https://storage.googleapis.com/magentadata/js/checkpoints/piano_genie/model/epiano/stp_iq_auto_contour_dt_166006';
const genie = new PianoGenie(checkpoint);

// temperature: number 
// seed: number 
// { id: 'sequence', name: 'Sequence', type: 'string', description: 'Inputs sequence.' },

genie.nextFromKeyList(button: number, keyList: number[], temperature?: number, seed?: number): number
genie.resetState()

