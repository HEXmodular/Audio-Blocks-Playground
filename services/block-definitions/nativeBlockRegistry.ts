import { BlockDefinition } from '@interfaces/common';

// Import native block classes
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

// Import services that provide definitions
// import { AudioEngineService } from '../AudioEngineService'; // Removed as no longer needed

export const ALL_NATIVE_BLOCK_DEFINITIONS: BlockDefinition[] = [
    OscillatorNativeBlock.getOscillatorDefinition(),
    OscillatorNativeBlock.getLfoDefinition(),
    OscillatorNativeBlock.getLfoBpmSyncDefinition(),
    BiquadFilterNativeBlock.getDefinition(),
    DelayNativeBlock.getDefinition(),
    AllpassFilterNativeBlock.getDefinition(),
    EnvelopeNativeBlock.getADEnvelopeDefinition(),
    EnvelopeNativeBlock.getAREnvelopeDefinition(),
    OscilloscopeNativeBlock.getDefinition(),
    NumberToConstantAudioNativeBlock.getDefinition(),
    GainControlNativeBlock.getDefinition(),
    AudioOutputNativeBlock.getDefinition(), // Added new definition
    LyriaMasterBlock.getDefinition(),
    // AudioEngineService.getAudioOutputDefinition(), // Removed old definition
];
