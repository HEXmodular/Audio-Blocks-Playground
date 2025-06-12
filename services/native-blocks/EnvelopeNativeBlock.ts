import { BlockDefinition, BlockParameter, ManagedNativeNodeInfo } from '@interfaces/common'; // Updated import
import { CreatableNode } from './CreatableNode';

export class EnvelopeNativeBlock implements CreatableNode {
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
        _initialParams: BlockParameter[] // initialParams might be used if envelope has initial settings not covered by ADSR values
    ): ManagedNativeNodeInfo {
        if (!this.context) throw new Error("AudioContext not initialized");
        const constSourceNode = this.context.createConstantSource();
        constSourceNode.offset.value = 0; // Envelopes typically start at 0
        constSourceNode.start(); // Start the source so it can be ramped

        // No direct AudioParam targets for CV for typical AD/AR envelopes via ConstantSourceNode offset automation.
        // CV inputs would typically go into the 'trigger_in' or 'gate_in' of the block's logic.
        const paramTargetsForCv = new Map<string, AudioParam>();

        return {
            node: constSourceNode, // The ConstantSourceNode is the output and what gets parameters automated
            nodeForInputConnections: constSourceNode, // Not typical for an envelope source, but for consistency
            nodeForOutputConnections: constSourceNode,
            mainProcessingNode: constSourceNode,
            paramTargetsForCv,
            definition,
            instanceId,
            constantSourceValueNode: constSourceNode, // Specific for NativeNodeManager to control
        };
    }

    updateNodeParams(
        _nodeInfo: ManagedNativeNodeInfo,
        _parameters: BlockParameter[],
        _currentInputs?: Record<string, any>,
        _currentBpm?: number
    ): void {
        // For AD/AR envelopes driven by ConstantSourceNode, parameter changes (like attackTime, decayTime)
        // don't directly set AudioParams here. Instead, the block's logicCode interprets these
        // parameters and then calls specific methods on AudioEngineService/NativeNodeManager
        // (e.g., triggerNativeNodeEnvelope) which then perform the AudioParam automations.
        // So, this updateNodeParams might be a no-op for pure envelope parameters.
        // If there were other continuous AudioParams (e.g. a 'depth' control on the envelope output), they'd be handled here.
        // console.log(`EnvelopeNativeBlock.updateNodeParams called for ${_nodeInfo.instanceId}, but typically no direct AudioParam automation here.`);
    }

    connect(_destination: AudioNode | AudioParam, _outputIndex?: number, _inputIndex?: number): void {
        console.warn(`EnvelopeNativeBlock.connect called directly on instance. This should be handled by AudioGraphConnectorService.`);
    }

    disconnect(_destination?: AudioNode | AudioParam | number, _output?: number, _input?: number): void {
        console.warn(`EnvelopeNativeBlock.disconnect called directly on instance. This should be handled by AudioGraphConnectorService or by the manager's removeManagedNativeNode.`);
    }
}
