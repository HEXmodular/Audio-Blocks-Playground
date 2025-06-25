import { BlockDefinition, BlockInstance, BlockParameter, ManagedNativeNodeInfo } from '@interfaces/common'; // Updated import

export interface CreatableNode {
    createNode(
        instanceId: string,
        definition: BlockDefinition,
        initialParams: BlockParameter[],
    ): ManagedNativeNodeInfo;

    updateNodeParams(
        nodeInfo: ManagedNativeNodeInfo,
        instance: BlockInstance,
    ): void;

    // Optional connect/disconnect if the block itself needs to manage complex internal routing
    // not handled by simple nodeForInput/OutputConnections.
    // Most simple blocks will not need these, AudioGraphConnectorService handles external connections.
    connect?(destinationNode: any, outputIndex?: number, inputIndex?: number): any;
    disconnect?(destinationNode?: any, output?: number, input?: number): void;
    dispose?(nodeInfo: ManagedNativeNodeInfo): void; // Added dispose
}
