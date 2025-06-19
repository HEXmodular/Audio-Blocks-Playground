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

    setAudioContext(context: any): void; // Made 'any' for flexibility with Tone.Context / AudioContext

    // Optional connect/disconnect if the block itself needs to manage complex internal routing
    // not handled by simple nodeForInput/OutputConnections.
    // Most simple blocks will not need these, AudioGraphConnectorService handles external connections.
    connect?(destinationNode: any, outputIndex?: number, inputIndex?: number): any;
    disconnect?(destinationNode?: any, output?: number, input?: number): void;
    dispose?(nodeInfo: ManagedNativeNodeInfo): void; // Added dispose
}
