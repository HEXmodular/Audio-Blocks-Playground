import { BlockDefinition, BlockParameter } from '../../types';
import { ManagedNativeNodeInfo } from '../NativeNodeManager';
import { CreatableNode } from './CreatableNode';

export class DelayNativeBlock extends CreatableNode {
    constructor(audioContext: AudioContext | null) {
        super(audioContext);
    }

    createNode(
        instanceId: string,
        definition: BlockDefinition,
        initialParams: BlockParameter[]
        // currentBpm is not used by DelayNode
    ): ManagedNativeNodeInfo {
        if (!this.audioContext) {
            throw new Error("AudioContext is not initialized for DelayNativeBlock.");
        }

        // Default maxDelayTime is 1.0 sec, consistent with AudioNodeManager's previous value for DelayNode if not specified.
        // The NATIVE_DELAY_BLOCK_DEFINITION might specify a maxDelayTime in its parameters if needed,
        // but typical DelayNode creation takes maxDelayTime as an argument.
        // We'll use a default of 5.0 as was in the original NativeNodeManager.
        const delay = this.audioContext.createDelay(5.0);

        const paramTargets = new Map<string, AudioParam>();
        paramTargets.set('delayTime', delay.delayTime);

        // Initial parameters are applied by NativeNodeManager via updateNodeParams

        return {
            nodeForInputConnections: delay,
            nodeForOutputConnections: delay,
            mainProcessingNode: delay,
            paramTargetsForCv: paramTargets,
            definition: definition,
            instanceId: instanceId,
        };
    }

    updateNodeParams(
        info: ManagedNativeNodeInfo,
        parameters: BlockParameter[]
        // currentInputs and currentBpm are not used by DelayNode
    ): void {
        if (!this.audioContext || !info.mainProcessingNode || !(info.mainProcessingNode instanceof DelayNode)) {
            console.warn(`[DelayNativeBlock Update] AudioContext not ready or node not a DelayNode for instance ${info.instanceId}.`);
            return;
        }

        // const delayNode = info.mainProcessingNode as DelayNode; // Not strictly needed if only using paramTargetsForCv

        parameters.forEach(param => {
            const targetAudioParam = info.paramTargetsForCv?.get(param.id);
            if (targetAudioParam) {
                if (typeof param.currentValue === 'number') {
                    // Ensure delayTime is not set to a value outside the allowed range if applicable,
                    // though setTargetAtTime usually handles this gracefully.
                    targetAudioParam.setTargetAtTime(param.currentValue, this.audioContext!.currentTime, 0.01);
                }
            }
            // No other specific parameters like 'type' for DelayNode.
        });
    }

    // connect and disconnect are inherited, commented out as per previous block's reasoning
    // connect(destination: AudioNode): void {
    //     // ...
    // }

    // disconnect(destination: AudioNode): void {
    //     // ...
    // }
}
