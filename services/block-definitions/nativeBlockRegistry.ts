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

// Import services that provide definitions
import { AudioEngineService } from '../AudioEngineService';

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
    AudioEngineService.getAudioOutputDefinition(),
];
