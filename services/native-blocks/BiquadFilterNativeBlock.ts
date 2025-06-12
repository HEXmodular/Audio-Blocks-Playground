import { BlockDefinition, BlockParameter } from '../@types/types';
import { ManagedNativeNodeInfo } from '../NativeNodeManager';
import { CreatableNode } from './CreatableNode';
import { NATIVE_BIQUAD_FILTER_BLOCK_DEFINITION } from '@constants/constants';

export class BiquadFilterNativeBlock extends CreatableNode {
    constructor(audioContext: AudioContext | null) {
        super(audioContext);
    }

    createNode(
        instanceId: string,
        definition: BlockDefinition,
        initialParams: BlockParameter[]
        // currentBpm is not used by BiquadFilter
    ): ManagedNativeNodeInfo {
        if (!this.audioContext) {
            throw new Error("AudioContext is not initialized for BiquadFilterNativeBlock.");
        }

        const biquad = this.audioContext.createBiquadFilter();

        const paramTargets = new Map<string, AudioParam>();
        paramTargets.set('frequency', biquad.frequency);
        paramTargets.set('Q', biquad.Q);
        paramTargets.set('gain', biquad.gain);

        // Initial parameters are applied by NativeNodeManager via updateNodeParams

        return {
            nodeForInputConnections: biquad,
            nodeForOutputConnections: biquad,
            mainProcessingNode: biquad,
            paramTargetsForCv: paramTargets,
            definition: definition,
            instanceId: instanceId,
        };
    }

    updateNodeParams(
        info: ManagedNativeNodeInfo,
        parameters: BlockParameter[]
        // currentInputs and currentBpm are not used by BiquadFilter
    ): void {
        if (!this.audioContext || !info.mainProcessingNode || !(info.mainProcessingNode instanceof BiquadFilterNode)) {
            console.warn(`[BiquadFilterNativeBlock Update] AudioContext not ready or node not a BiquadFilterNode for instance ${info.instanceId}.`);
            return;
        }

        const biquadNode = info.mainProcessingNode as BiquadFilterNode;

        parameters.forEach(param => {
            const targetAudioParam = info.paramTargetsForCv?.get(param.id);
            if (targetAudioParam) {
                if (typeof param.currentValue === 'number') {
                    targetAudioParam.setTargetAtTime(param.currentValue, this.audioContext!.currentTime, 0.01);
                }
            } else if (param.id === 'type' && typeof param.currentValue === 'string') {
                biquadNode.type = param.currentValue as globalThis.BiquadFilterType;
            }
        });
    }

    // connect and disconnect are inherited, not typically called directly by NativeNodeManager
    // connect(destination: AudioNode): void {
    //     if (this.audioContext && this.isContextInitialized() && this.isContextInitialized() && info.mainProcessingNode) {
    //          // Assuming info.mainProcessingNode holds the biquad filter
    //         info.mainProcessingNode.connect(destination);
    //     } else {
    //         console.warn("BiquadFilterNativeBlock.connect() called but context or node is not initialized.");
    //     }
    // }

    // disconnect(destination: AudioNode): void {
    //     if (this.audioContext && this.isContextInitialized() && info.mainProcessingNode) {
    //         // Assuming info.mainProcessingNode holds the biquad filter
    //         info.mainProcessingNode.disconnect(destination);
    //     } else {
    //         console.warn("BiquadFilterNativeBlock.disconnect() called but context or node is not initialized.");
    //     }
    // }
}
