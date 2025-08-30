// создает ноды из списка классов блоков
import { ToneAudioNode } from 'tone'; // Added Tone import
import { BlockDefinition, BlockInstance, NativeBlock } from '@interfaces/block';

import BlockStateManager from '@state/BlockStateManager';
import { AudioOutputBlock } from '@blocks/native-blocks/AudioOutputBlock';
import { RecorderBlock } from '@blocks/native-blocks/tone-js-components/RecorderBlock';
import { SplitBlock } from '@blocks/native-blocks/tone-js-components/SplitBlock';
// import { OscilloscopeNativeBlock } from '@services/native-blocks/OscilloscopeNativeBlock';
import { ByteBeatPlayer } from '@blocks/8bit/ByteBeatPlayer';
import { ManualGateBlock } from '@blocks/native-blocks/ManualGateBlock';
import { BiquadFilterBlock } from '@blocks/native-blocks/BiquadFilterBlock';
import { OscillatorBlock } from '@blocks/native-blocks/OscillatorBlock';
import { PitchShiftBlock } from '@blocks/effects/PitchShiftBlock';
import { PianoGenieBlock } from '@blocks/magenta/PianoGenieBlock';
import { StepSequencerBlock } from '@blocks/native-blocks/sequencers/StepSequencerBlock';
import { DataSequencerBlock } from '@blocks/native-blocks/sequencers/DataSequencerBlock';
import { TrackerBlock } from '@/blocks/native-blocks/sequencers/TrackerBlock';

import { AutoFilterBlock } from '@blocks/effects/AutoFilter';
import { AutoPannerBlock } from '@blocks/effects/AutoPanner';
import { AutoWahBlock } from '@blocks/effects/AutoWah';
import { BitCrusherBlock } from '@blocks/effects/BitCrusher';
import { ChebyshevBlock } from '@blocks/effects/Chebyshev';
import { ChorusBlock } from '@blocks/effects/Chorus';
import { DistortionBlock } from '@/blocks/effects/Distortion';
import { PhaserBlock } from '@/blocks/effects/Phaser';
import { FeedbackDelayBlock } from '@/blocks/effects/FeedbackDelay';
import { FreeverbBlock } from '@/blocks/effects/Freeverb';
import { FrequencyShifterBlock } from '@/blocks/effects/FrequencyShifter';
import { JCReverbBlock } from '@/blocks/effects/JCReverb';
import { PingPongDelayBlock } from '@/blocks/effects/PingPongDelay';
import { ReverbBlock } from '@/blocks/effects/Reverb';
import { StereoWidenerBlock } from '@/blocks/effects/StereoWidener';
import { TremoloBlock } from '@/blocks/effects/Tremolo';
import { VibratoBlock } from '@/blocks/effects/Vibrato';
import { ContainerBlock } from '@/blocks/native-blocks/ContainerBlock';
import { LyriaMasterBlock } from '@blocks/lyria-blocks/LyriaMaster';
import { MidiCcInputBlock } from '@/blocks/midi/MidiCcInputBlock';
import { ChaosBlock } from '@/blocks/8bit/ChaosBlock';
import { NeuralArpeggiatorBlock } from '@/blocks/magenta/NeuralArpeggiatorBlock';
import { MergeBlock } from '@/blocks/native-blocks/tone-js-components/MergeBlock';


const BLOCK_HANDLERS: Map<string, any> = new Map([
    [AudioOutputBlock.getDefinition().id, AudioOutputBlock as any],
    [ManualGateBlock.getDefinition().id, ManualGateBlock as any],
    [BiquadFilterBlock.getDefinition().id, BiquadFilterBlock as any],
    [OscillatorBlock.getDefinition().id, OscillatorBlock as any],

    [ByteBeatPlayer.getDefinition().id, ByteBeatPlayer as any],
    [ChaosBlock.getDefinition().id, ChaosBlock as any],

    // sequencers
    [StepSequencerBlock.getDefinition().id, StepSequencerBlock as any],
    [DataSequencerBlock.getDefinition().id, DataSequencerBlock as any],
    [TrackerBlock.getDefinition().id, TrackerBlock as any],

    // ai
    [PianoGenieBlock.getDefinition().id, PianoGenieBlock as any],
    [NeuralArpeggiatorBlock.getDefinition().id, NeuralArpeggiatorBlock as any],
    [LyriaMasterBlock.getDefinition().id, LyriaMasterBlock as any],
   
    // effects
    [AutoFilterBlock.getDefinition().id, AutoFilterBlock as any],
    [AutoPannerBlock.getDefinition().id, AutoPannerBlock as any],
    [AutoWahBlock.getDefinition().id, AutoWahBlock as any],
    [BitCrusherBlock.getDefinition().id, BitCrusherBlock as any],
    [ChebyshevBlock.getDefinition().id, ChebyshevBlock as any],
    [ChorusBlock.getDefinition().id, ChorusBlock as any],
    [DistortionBlock.getDefinition().id, DistortionBlock as any],
    [FeedbackDelayBlock.getDefinition().id, FeedbackDelayBlock as any],
    [FreeverbBlock.getDefinition().id, FreeverbBlock as any],
    [FrequencyShifterBlock.getDefinition().id, FrequencyShifterBlock as any],
    [JCReverbBlock.getDefinition().id, JCReverbBlock as any],
    [PhaserBlock.getDefinition().id, PhaserBlock as any],
    [PingPongDelayBlock.getDefinition().id, PingPongDelayBlock as any],
    [PitchShiftBlock.getDefinition().id, PitchShiftBlock as any],
    [ReverbBlock.getDefinition().id, ReverbBlock as any],
    [StereoWidenerBlock.getDefinition().id, StereoWidenerBlock as any],
    [TremoloBlock.getDefinition().id, TremoloBlock as any],
    [VibratoBlock.getDefinition().id, VibratoBlock as any],

    // tone-js-components
    [RecorderBlock.getDefinition().id, RecorderBlock as any],
    [SplitBlock.getDefinition().id, SplitBlock as any],
    [MergeBlock.getDefinition().id, MergeBlock as any],

    // containers
    [ContainerBlock.getDefinition().id, ContainerBlock as any],

    // midi
    [MidiCcInputBlock.getDefinition().id, MidiCcInputBlock as any],
])

export const ALL_NATIVE_BLOCK_DEFINITIONS: BlockDefinition[] = Array
    .from(BLOCK_HANDLERS.values())
    .map(classRef => classRef.getDefinition());

class AudioNodeCreator {
    private static instance: AudioNodeCreator;

    private blockHandlers = BLOCK_HANDLERS;

    private constructor() {
    }

    // Static method to get the singleton instance
    public static getInstance(): AudioNodeCreator {
        if (!AudioNodeCreator.instance) {
            AudioNodeCreator.instance = new AudioNodeCreator();
        }
        return AudioNodeCreator.instance;
    }

    // создает экземпляр класса
    public setupManagedNativeNode(
        instance: BlockInstance, // Use BlockInstance directly
    ): ToneAudioNode & NativeBlock | null {
        // console.log(`[AudioNodeCreator/Native Setup] Setting up Tone.js based node for '${definition.name}' (ID: ${instanceId})`);
        try {
            const classRef = this.blockHandlers.get(instance.definition.id) as any //as ({constructor: new (params: BlockParameter[]) => Tone.ToneAudioNode});
            // initialParams
            const instanceRef = new classRef() as ToneAudioNode & NativeBlock; // Create an instance of the Tone.js based node class
            return instanceRef;
        } catch (e) {
            console.error(`Failed to construct Tone.js based node: ${(e as Error).message}`);
            debugger
            return null;
        }
    }

    // генерирует тонну говна
    // private addLog(/*instanceId: string, message: string, _type: 'info' | 'warn' | 'error' = 'info'*/) {
    //     // BlockStateManager.addLogToBlockInstance(instanceId, message);
    // }

    public async processAudioNodeSetupAndTeardown(
    ) {
        const blockInstances = BlockStateManager.getBlockInstances() // получение сохраненных блоков с их уникальным идентификатором instanceId

        if (blockInstances.length > 0) {
            console.log('[AudioNodeCreator processAudioNodeSetupAndTeardown] Instance IDs:', blockInstances.map(inst => inst.instanceId));
        }

        // для передачи созданного экземпляра в менеджер блока для хранения
        for (const instance of blockInstances) {
            if (!instance.instance) {
                // Node needs setup.
                const instanceRef = this.setupManagedNativeNode(instance);
                if (instanceRef) {
                    BlockStateManager.updateBlockInstance(instance.instanceId, currentInst => ({
                        ...currentInst,
                        instance: instanceRef,
                        // internalState: { ...currentInst.internalState, needsAudioNodeSetup: false, loggedAudioSystemNotActive: false }
                    }));
                    // this.addLog(instance.instanceId, "Native node setup successful.");
                    console.log(instance.instanceId, "Native node setup successful.");
                } else {
                    debugger
                    // this.addLog(instance.instanceId, "Native node setup failed.", "error");
                    console.error(instance.instanceId, "Native node setup failed.", "error");
                    // this.updateInstance(instance.instanceId, { error: "Native node setup failed." });
                }
            }
        }
    }
}

export default AudioNodeCreator.getInstance();
