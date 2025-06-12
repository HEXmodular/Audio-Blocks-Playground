import { BlockDefinition, BlockParameter, OscillatorType } from '../../../types';
import { ManagedNativeNodeInfo } from '../../NativeNodeManager'; // Assuming AllpassInternalNodes might not be needed here, but ManagedNativeNodeInfo is.
import { NATIVE_OSCILLATOR_BLOCK_DEFINITION, NATIVE_LFO_BLOCK_DEFINITION, NATIVE_LFO_BPM_SYNC_BLOCK_DEFINITION } from '../../../constants';
import { CreatableNode } from './CreatableNode';

export class OscillatorNativeBlock extends CreatableNode {
    constructor(audioContext: AudioContext | null) {
        super(audioContext);
    }

    createNode(
        instanceId: string,
        definition: BlockDefinition,
        initialParams: BlockParameter[],
        currentBpm?: number // Not used directly in oscillator creation but part of interface
    ): ManagedNativeNodeInfo {
        if (!this.audioContext) {
            throw new Error("AudioContext is not initialized for OscillatorNativeBlock.");
        }

        const osc = this.audioContext.createOscillator();
        const internalGain = this.audioContext.createGain();
        osc.connect(internalGain);
        osc.start();

        const paramTargets = new Map<string, AudioParam>();
        paramTargets.set('frequency', osc.frequency);
        paramTargets.set('gain', internalGain.gain);

        // Initial parameters are applied by the NativeNodeManager after this call via updateNodeParams

        return {
            nodeForInputConnections: internalGain, // Input to the gain node controls the oscillator's amplitude
            nodeForOutputConnections: internalGain, // Output from the gain node
            mainProcessingNode: osc,
            internalGainNode: internalGain,
            paramTargetsForCv: paramTargets,
            definition: definition,
            instanceId: instanceId,
        };
    }

    updateNodeParams(
        info: ManagedNativeNodeInfo,
        parameters: BlockParameter[],
        currentInputs?: Record<string, any>, // Not typically used by basic oscillator params
        currentBpm: number = 120 // Required for LFO BPM Sync
    ): void {
        if (!this.audioContext || !info.mainProcessingNode || !(info.mainProcessingNode instanceof OscillatorNode) || !info.internalGainNode) {
            console.warn(`[OscillatorNativeBlock Update] AudioContext not ready or node not an OscillatorNode for instance ${info.instanceId}.`);
            return;
        }

        const oscNode = info.mainProcessingNode as OscillatorNode;
        // const gainNode = info.internalGainNode as GainNode; // This is available if direct gain updates are needed outside of paramTargetsForCv

        parameters.forEach(param => {
            const targetAudioParam = info.paramTargetsForCv?.get(param.id);
            if (targetAudioParam) {
                if (typeof param.currentValue === 'number') {
                    // Default handling for frequency and gain if they are CV-targetable
                    targetAudioParam.setTargetAtTime(param.currentValue, this.audioContext!.currentTime, 0.01);
                }
            } else if (param.id === 'waveform' && typeof param.currentValue === 'string') {
                oscNode.type = param.currentValue as OscillatorType;
            }

            // Specific handling for LFO BPM Sync frequency
            if (info.definition.id === NATIVE_LFO_BPM_SYNC_BLOCK_DEFINITION.id && param.id === 'frequency') {
                 // This parameter is named 'frequency' in the UI for LFOs, but its calculation is based on BPM.
                 // The actual 'frequency' AudioParam of the oscillator is what we're targeting.
                const bpmFractionParam = parameters.find(p => p.id === 'bpm_fraction');
                // Use a default bpmFraction if not found, though it should be part of the block's definition
                const bpmFractionString = bpmFractionParam?.currentValue?.toString() ?? "1";
                const bpmFraction = parseFloat(bpmFractionString);

                if (!isNaN(bpmFraction) && currentBpm > 0) {
                    const lfoFreq = 1.0 / ((60.0 / currentBpm) * bpmFraction);
                    if (isFinite(lfoFreq) && lfoFreq > 0) {
                        // console.log(`[OscillatorNativeBlock Update] LFO BPM Sync: bpm=${currentBpm}, fraction=${bpmFraction}, calculatedFreq=${lfoFreq}`);
                        oscNode.frequency.setTargetAtTime(lfoFreq, this.audioContext!.currentTime, 0.01);
                    } else {
                        // console.warn(`[OscillatorNativeBlock Update] LFO BPM Sync: Invalid LFO frequency calculated: ${lfoFreq}`);
                    }
                }
            }
        });
    }

    // `connect` and `disconnect` methods are inherited from NativeBlock if needed,
    // but for nodes created by NativeNodeManager, connection/disconnection is handled by AudioGraphConnectorService using the
    // nodeForInputConnections and nodeForOutputConnections from ManagedNativeNodeInfo.
    // These might need implementation if OscillatorNativeBlock itself were to manage its own connections directly.
    connect(destination: AudioNode): void {
        if (this.audioContext && this.isContextInitialized()) {
            // This implementation depends on how OscillatorNativeBlock is intended to be used.
            // If it holds a direct reference to its output node (e.g., from createNode), it would connect that.
            // However, NativeNodeManager usually handles connections based on ManagedNativeNodeInfo.
            // For now, let's assume this is for more direct usage if ever needed.
            console.warn("OscillatorNativeBlock.connect() called - ensure this is the intended connection management path.");
        }
    }

    disconnect(destination: AudioNode): void {
        if (this.audioContext && this.isContextInitialized()) {
            console.warn("OscillatorNativeBlock.disconnect() called - ensure this is the intended connection management path.");
        }
    }
}
