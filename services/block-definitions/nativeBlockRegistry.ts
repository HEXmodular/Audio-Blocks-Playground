import { BlockDefinition } from '@interfaces/common';

// Import native block classes
import { ByteBeatNativeBlock } from "../native-blocks/ByteBeatNativeBlock";
import { OscillatorNativeBlock } from '../native-blocks/OscillatorNativeBlock';
import { BiquadFilterNativeBlock } from '../native-blocks/BiquadFilterNativeBlock';
import { DelayNativeBlock } from '../native-blocks/DelayNativeBlock';
import { AllpassFilterNativeBlock } from '../native-blocks/AllpassFilterNativeBlock';
import { EnvelopeNativeBlock } from '../native-blocks/EnvelopeNativeBlock';
import { OscilloscopeNativeBlock } from '../native-blocks/OscilloscopeNativeBlock';
import { NumberToConstantAudioNativeBlock } from '../native-blocks/NumberToConstantAudioNativeBlock';
import { GainControlNativeBlock } from '../native-blocks/GainControlNativeBlock';
import { AudioOutputNativeBlock } from '../native-blocks/AudioOutputNativeBlock';
import { LyriaMasterBlock } from '../lyria-blocks/LyriaMaster';
import { ManualGateNativeBlock } from '../native-blocks/ManualGateNativeBlock';
import { StepSequencerNativeBlock } from '../native-blocks/sequencers/StepSequencerNativeBlock';

// Import services that provide definitions
// import { AudioEngineService } from '../AudioEngineService'; // Removed as no longer needed

export const ALL_NATIVE_BLOCK_DEFINITIONS: BlockDefinition[] = [
    StepSequencerNativeBlock.getDefinition(), // Added Step Sequencer
    OscillatorNativeBlock.getOscillatorDefinition(),
    OscillatorNativeBlock.getLfoDefinition(),
    OscillatorNativeBlock.getLfoBpmSyncDefinition(),
    BiquadFilterNativeBlock.getDefinition(),
    DelayNativeBlock.getDefinition(),
    AllpassFilterNativeBlock.getDefinition(),
    EnvelopeNativeBlock.getDefinition(), // Corrected to single definition
    OscilloscopeNativeBlock.getDefinition(),
    NumberToConstantAudioNativeBlock.getDefinition(),
    GainControlNativeBlock.getDefinition(),
    AudioOutputNativeBlock.getDefinition(), // Added new definition
    LyriaMasterBlock.getDefinition(),
    ManualGateNativeBlock.getDefinition(),
    ByteBeatNativeBlock.getDefinition(),
    // AudioEngineService.getAudioOutputDefinition(), // Removed old definition
];

// Map of native block IDs to their class constructors
// This allows for dynamic instantiation of native blocks
// export const NATIVE_BLOCK_MAP = {
//     [OscillatorNativeBlock.getOscillatorDefinition().id]: OscillatorNativeBlock,
//     [OscillatorNativeBlock.getLfoDefinition().id]: OscillatorNativeBlock, // Assuming LFO uses the same class
//     [OscillatorNativeBlock.getLfoBpmSyncDefinition().id]: OscillatorNativeBlock, // Assuming LFO BPM Sync uses the same class
//     [BiquadFilterNativeBlock.getDefinition().id]: BiquadFilterNativeBlock,
//     [DelayNativeBlock.getDefinition().id]: DelayNativeBlock,
//     [AllpassFilterNativeBlock.getDefinition().id]: AllpassFilterNativeBlock,
//     [EnvelopeNativeBlock.getADEnvelopeDefinition().id]: EnvelopeNativeBlock, // Assuming AD Envelope uses the same class
//     [EnvelopeNativeBlock.getAREnvelopeDefinition().id]: EnvelopeNativeBlock, // Assuming AR Envelope uses the same class
//     [OscilloscopeNativeBlock.getDefinition().id]: OscilloscopeNativeBlock,
//     [NumberToConstantAudioNativeBlock.getDefinition().id]: NumberToConstantAudioNativeBlock,
//     [GainControlNativeBlock.getDefinition().id]: GainControlNativeBlock,
//     [AudioOutputNativeBlock.getDefinition().id]: AudioOutputNativeBlock,
//     [LyriaMasterBlock.getDefinition().id]: LyriaMasterBlock, // Though LyriaMasterBlock is special, including it for completeness
//     [ManualGateNativeBlock.getDefinition().id]: ManualGateNativeBlock,
// };
