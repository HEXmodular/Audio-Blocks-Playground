import { BlockDefinition, BlockParameter, ManagedNativeNodeInfo } from '@interfaces/common';
import { CreatableNode } from './CreatableNode';
import { createParameterDefinitions } from '@constants/constants';

export class ManualGateNativeBlock implements CreatableNode {
    private context: AudioContext | null;

    public static getDefinition(): BlockDefinition {
      return {
        id: 'native-manual-gate-v1', // Changed ID to reflect native implementation
        name: 'Manual Gate (Native)', // Changed name to reflect native implementation
        description: 'Provides a manual gate signal via a toggle UI parameter, using a native ConstantSourceNode.',
        runsAtAudioRate: true, // Native blocks that output audio run at audio rate
        inputs: [],
        outputs: [
          { id: 'gate_out', name: 'Gate Output', type: 'gate', description: 'Boolean gate signal.' }
        ],
        parameters: createParameterDefinitions([
          { id: 'gate_active', name: 'Gate Active', type: 'toggle', defaultValue: false, description: 'Controls the state of the gate output.' }
        ]),
        logicCode: "", // Native blocks do not use logicCode
      };
    }

    constructor(context: AudioContext | null) {
        this.context = context;
    }

    setAudioContext(context: AudioContext | null): void {
        this.context = context;
    }

    createNode(
        instanceId: string,
        definition: BlockDefinition,
        initialParams: BlockParameter[],
        _currentBpm?: number
    ): ManagedNativeNodeInfo {
        if (!this.context) throw new Error("AudioContext not initialized for ManualGateNativeBlock");

        const constantSourceNode = this.context.createConstantSource();
        constantSourceNode.offset.value = 0; // Default to 0 (gate off)

        const gateActiveParam = initialParams.find(p => p.id === 'gate_active');
        if (gateActiveParam) {
            constantSourceNode.offset.value = (gateActiveParam.currentValue as boolean) ? 1 : 0;
        }

        constantSourceNode.start(); // ConstantSourceNode needs to be started

        return {
            node: constantSourceNode,
            nodeForInputConnections: null, // No direct audio input
            nodeForOutputConnections: constantSourceNode,
            mainProcessingNode: constantSourceNode,
            paramTargetsForCv: new Map<string, AudioParam>(), // No CV inputs for this simple gate
            definition,
            instanceId,
            constantSourceValueNode: constantSourceNode, // Specific for nodes that are ConstantSourceNode-like
        };
    }

    updateNodeParams(
        nodeInfo: ManagedNativeNodeInfo,
        parameters: BlockParameter[],
        _currentInputs?: Record<string, any>,
        _currentBpm?: number
    ): void {
        if (!this.context || !(nodeInfo.mainProcessingNode instanceof ConstantSourceNode)) return;

        const constantSourceNode = nodeInfo.mainProcessingNode;
        const gateActiveParam = parameters.find(p => p.id === 'gate_active');

        if (gateActiveParam && constantSourceNode.offset) {
            const newValue = (gateActiveParam.currentValue as boolean) ? 1 : 0;
            // Avoids clicks if possible, though for a gate, direct change is often fine.
            constantSourceNode.offset.setTargetAtTime(newValue, this.context.currentTime, 0.01);
        }
    }

    connect(_destination: AudioNode | AudioParam, _outputIndex?: number, _inputIndex?: number): void {
        // Connections are handled by AudioGraphConnectorService
        console.warn(`ManualGateNativeBlock.connect called directly on instance. This should be handled by AudioGraphConnectorService.`);
    }

    disconnect(_destination?: AudioNode | AudioParam | number, _output?: number, _input?: number): void {
        // Disconnections are handled by AudioGraphConnectorService or NativeNodeManager
        console.warn(`ManualGateNativeBlock.disconnect called directly on instance. This should be handled by the manager's removeManagedNativeNode.`);
    }
}
