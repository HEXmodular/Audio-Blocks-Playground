import { BlockDefinition, BlockParameter, ManagedNativeNodeInfo } from '@interfaces/common'; // Updated import
import { CreatableNode } from './CreatableNode';

export class DelayNativeBlock implements CreatableNode {
    private context: AudioContext;

    constructor(context: AudioContext) {
        this.context = context;
    }

    setAudioContext(context: AudioContext | null): void {
        this.context = context!;
    }

    createNode(
        instanceId: string,
        definition: BlockDefinition,
        initialParams: BlockParameter[]
    ): ManagedNativeNodeInfo {
        if (!this.context) throw new Error("AudioContext not initialized");
        // Max delay time of 5 seconds, can be configured if needed
        const delayNode = this.context.createDelay(5.0);

        const paramTargetsForCv = new Map<string, AudioParam>();
        paramTargetsForCv.set('delayTime', delayNode.delayTime);

        // Apply initial parameters
        initialParams.forEach(param => {
            if (param.id === 'delayTime') {
                delayNode.delayTime.value = Number(param.currentValue);
            }
        });

        return {
            node: delayNode, // The DelayNode itself is the main node
            nodeForInputConnections: delayNode,
            nodeForOutputConnections: delayNode,
            mainProcessingNode: delayNode,
            paramTargetsForCv,
            definition,
            instanceId,
        };
    }

    updateNodeParams(
        nodeInfo: ManagedNativeNodeInfo,
        parameters: BlockParameter[]
    ): void {
        if (!this.context || !(nodeInfo.mainProcessingNode instanceof DelayNode)) return;
        const delayNode = nodeInfo.mainProcessingNode;

        parameters.forEach(param => {
            if (param.id === 'delayTime' && delayNode.delayTime) {
                delayNode.delayTime.setTargetAtTime(Number(param.currentValue), this.context!.currentTime, 0.01);
            }
        });
    }

    connect(destination: AudioNode | AudioParam, outputIndex?: number, inputIndex?: number): void {
        console.warn(`DelayNativeBlock.connect called directly on instance. This should be handled by AudioGraphConnectorService.`);
    }

    disconnect(destination?: AudioNode | AudioParam | number, output?: number, input?: number): void {
        console.warn(`DelayNativeBlock.disconnect called directly on instance. This should be handled by AudioGraphConnectorService or by the manager's removeManagedNativeNode.`);
    }
}
