import { BlockDefinition, BlockParameter } from '@interfaces/common';
import { ManagedNativeNodeInfo } from '@services/NativeNodeManager';
import { CreatableNode } from './CreatableNode';

export class BiquadFilterNativeBlock extends CreatableNode {
    constructor(audioContext: AudioContext | null) {
        super(audioContext);
    }

    createNode(
        instanceId: string,
        definition: BlockDefinition,
        // initialParams: BlockParameter[] is not used by BiquadFilter
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

    connect(destination: AudioNode, outputIndex?: number, inputIndex?: number): void {
        // This class (and other CreatableNode derivatives) provides nodes to NativeNodeManager.
        // The actual connection logic using these nodes is handled by AudioGraphConnectorService.
        // This method is primarily for interface conformance with NativeBlock.
        // It could be implemented if direct connection control from the block instance itself was needed,
        // but that would require the block to store its own ManagedNativeNodeInfo or relevant AudioNodes.
        console.warn(`${this.constructor.name}.connect(dest, outIdx=${outputIndex}, inIdx=${inputIndex}) called. This is generally a stub. Connections are managed by AudioGraphConnectorService using node info provided by createNode().`);
        // Example of what it might do if it stored its output node:
        // const nodeInfo = this.getManagedNodeInfo(); // Hypothetical method
        // if (nodeInfo && nodeInfo.nodeForOutputConnections) {
        //   nodeInfo.nodeForOutputConnections.connect(destination, outputIndex, inputIndex);
        // } else {
        //   console.warn(`${this.constructor.name}: Output node not available for direct connection.`);
        // }
    }

    disconnect(destination?: AudioNode, outputIndex?: number): void {
        // Similar to connect, this is a stub for interface conformance.
        // Actual disconnection is handled by AudioGraphConnectorService or NativeNodeManager.
        console.warn(`${this.constructor.name}.disconnect(dest, outIdx=${outputIndex}) called. This is generally a stub. Disconnections are managed externally.`);
        // Example:
        // const nodeInfo = this.getManagedNodeInfo(); // Hypothetical method
        // if (nodeInfo && nodeInfo.nodeForOutputConnections) {
        //   nodeInfo.nodeForOutputConnections.disconnect(destination, outputIndex);
        // } else {
        //   console.warn(`${this.constructor.name}: Output node not available for direct disconnection.`);
        // }
    }
}
