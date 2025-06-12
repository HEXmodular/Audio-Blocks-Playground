import { BlockDefinition, BlockParameter, ManagedNativeNodeInfo } from '@interfaces/common'; // Updated import
import { CreatableNode } from './CreatableNode';

export class BiquadFilterNativeBlock implements CreatableNode {
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
        const filterNode = this.context.createBiquadFilter();

        const paramTargetsForCv = new Map<string, AudioParam>();
        paramTargetsForCv.set('frequency', filterNode.frequency);
        paramTargetsForCv.set('Q', filterNode.Q);
        paramTargetsForCv.set('gain', filterNode.gain);

        // Apply initial parameters
        initialParams.forEach(param => {
            switch (param.id) {
                case 'frequency': filterNode.frequency.value = Number(param.currentValue); break;
                case 'q': filterNode.Q.value = Number(param.currentValue); break;
                case 'gain': filterNode.gain.value = Number(param.currentValue); break;
                case 'type': filterNode.type = param.currentValue as BiquadFilterType; break;
            }
        });

        return {
            node: filterNode, // The BiquadFilterNode itself is the main node
            nodeForInputConnections: filterNode,
            nodeForOutputConnections: filterNode,
            mainProcessingNode: filterNode,
            paramTargetsForCv,
            definition,
            instanceId,
        };
    }

    updateNodeParams(
        nodeInfo: ManagedNativeNodeInfo,
        parameters: BlockParameter[]
    ): void {
        if (!this.context || !(nodeInfo.mainProcessingNode instanceof BiquadFilterNode)) return;
        const filterNode = nodeInfo.mainProcessingNode;

        parameters.forEach(param => {
            if (param.id === 'frequency' && filterNode.frequency) {
                filterNode.frequency.setTargetAtTime(Number(param.currentValue), this.context!.currentTime, 0.01);
            } else if (param.id === 'q' && filterNode.Q) {
                filterNode.Q.setTargetAtTime(Number(param.currentValue), this.context!.currentTime, 0.01);
            } else if (param.id === 'gain' && filterNode.gain) {
                filterNode.gain.setTargetAtTime(Number(param.currentValue), this.context!.currentTime, 0.01);
            } else if (param.id === 'type') {
                filterNode.type = param.currentValue as BiquadFilterType;
            }
        });
    }

    connect(_destination: AudioNode | AudioParam, _outputIndex?: number, _inputIndex?: number): void {
        console.warn(`BiquadFilterNativeBlock.connect called directly on instance. This should be handled by AudioGraphConnectorService.`);
    }

    disconnect(_destination?: AudioNode | AudioParam | number, _output?: number, _input?: number): void {
        console.warn(`BiquadFilterNativeBlock.disconnect called directly on instance. This should be handled by AudioGraphConnectorService or by the manager's removeManagedNativeNode.`);
        // If this main node needs to be disconnected from everything it was connected to:
        // if (this.node && typeof this.node.disconnect === 'function') {
        //    this.node.disconnect();
        // }
    }
}
