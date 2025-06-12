import { BlockDefinition, BlockParameter, ManagedNativeNodeInfo } from '@interfaces/common'; // Updated import

export interface CreatableNode {
    createNode(
        instanceId: string,
        definition: BlockDefinition,
        initialParams: BlockParameter[],
        currentBpm?: number // Optional for BPM-dependent nodes
    ): ManagedNativeNodeInfo;

    updateNodeParams(
        nodeInfo: ManagedNativeNodeInfo,
        parameters: BlockParameter[],
        currentInputs?: Record<string, any>, // For blocks that react to input values directly on params
        currentBpm?: number
    ): void;

    setAudioContext(context: AudioContext | null): void; // Method to update the context

    // Optional connect/disconnect if the block itself needs to manage complex internal routing
    // not handled by simple nodeForInput/OutputConnections.
    // Most simple blocks will not need these, AudioGraphConnectorService handles external connections.
    connect?(destinationNode: AudioNode | AudioParam, outputIndex?: number, inputIndex?: number): AudioNode | void;
    disconnect?(destinationNode?: AudioNode | AudioParam, output?: number, input?: number): void;
}
