import { BlockDefinition, BlockParameter } from '@interfaces/common';
import { ManagedNativeNodeInfo } from '@services/NativeNodeManager';
import { NativeBlock } from './NativeBlock';

export abstract class CreatableNode extends NativeBlock {
    constructor(audioContext: AudioContext | null) {
        super(audioContext);
    }

    abstract createNode(
        instanceId: string,
        definition: BlockDefinition,
        initialParams: BlockParameter[],
        currentBpm?: number
    ): ManagedNativeNodeInfo;

    abstract updateNodeParams(
        info: ManagedNativeNodeInfo,
        parameters: BlockParameter[],
        currentInputs?: Record<string, any>,
        currentBpm?: number
    ): void;

    // Placeholder for potential future envelope trigger methods
    // triggerEnvelope?(instanceId: string, attackTime: number, decayTime: number, peakLevel: number): void;
    // triggerAttackHold?(instanceId: string, attackTime: number, sustainLevel: number): void;
    // triggerRelease?(instanceId: string, releaseTime: number): void;
}
