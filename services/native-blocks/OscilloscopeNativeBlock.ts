import { BlockDefinition, BlockParameter } from '@interfaces/common';
import { ManagedNativeNodeInfo } from '@services/NativeNodeManager';
import { CreatableNode } from './CreatableNode';

export class OscilloscopeNativeBlock extends CreatableNode {
    constructor(audioContext: AudioContext | null) {
        super(audioContext);
    }

    createNode(
        instanceId: string,
        definition: BlockDefinition,
        initialParams: BlockParameter[]
        // currentBpm is not used by AnalyserNode
    ): ManagedNativeNodeInfo {
        if (!this.audioContext) {
            throw new Error("AudioContext is not initialized for OscilloscopeNativeBlock.");
        }

        const analyser = this.audioContext.createAnalyser();

        // AnalyserNode does not have AudioParam targets in the same way as oscillators or filters for CV control.
        // Parameters like fftSize, minDecibels, etc., are properties.
        const paramTargets = new Map<string, AudioParam>(); // Empty for now, can be extended if any AudioParam-like control is found/needed.

        // Initial parameters (like fftSize) are applied by NativeNodeManager via updateNodeParams.

        return {
            nodeForInputConnections: analyser,
            nodeForOutputConnections: analyser, // AnalyserNode can pass through audio.
            mainProcessingNode: analyser,
            paramTargetsForCv: paramTargets,
            definition: definition,
            instanceId: instanceId,
        };
    }

    updateNodeParams(
        info: ManagedNativeNodeInfo,
        parameters: BlockParameter[]
        // currentInputs and currentBpm are not used by AnalyserNode
    ): void {
        if (!this.audioContext || !info.mainProcessingNode || !(info.mainProcessingNode instanceof AnalyserNode)) {
            console.warn(`[OscilloscopeNativeBlock Update] AudioContext not ready or node not an AnalyserNode for instance ${info.instanceId}.`);
            return;
        }

        const analyserNode = info.mainProcessingNode as AnalyserNode;

        parameters.forEach(param => {
            // AnalyserNode parameters are direct properties, not AudioParams for setTargetAtTime.
            if (param.id === 'fftSize' && typeof param.currentValue === 'number') {
                try {
                    analyserNode.fftSize = param.currentValue;
                } catch (e) {
                    console.error(`[OscilloscopeNativeBlock Update] Error setting fftSize to ${param.currentValue} for instance ${info.instanceId}:`, e);
                }
            } else if (param.id === 'minDecibels' && typeof param.currentValue === 'number') {
                analyserNode.minDecibels = param.currentValue;
            } else if (param.id === 'maxDecibels' && typeof param.currentValue === 'number') {
                analyserNode.maxDecibels = param.currentValue;
            } else if (param.id === 'smoothingTimeConstant' && typeof param.currentValue === 'number') {
                analyserNode.smoothingTimeConstant = param.currentValue;
            }
            // Add other AnalyserNode properties as needed.
        });
    }

    connect(destination: AudioNode, outputIndex?: number, inputIndex?: number): void {
        // This class (and other CreatableNode derivatives) provides nodes to NativeNodeManager.
        // The actual connection logic using these nodes is handled by AudioGraphConnectorService.
        // This method is primarily for interface conformance with NativeBlock.
        console.warn(`${this.constructor.name}.connect(dest, outIdx=${outputIndex}, inIdx=${inputIndex}) called. This is generally a stub. Connections are managed by AudioGraphConnectorService using node info provided by createNode().`);
    }

    disconnect(destination?: AudioNode, outputIndex?: number): void {
        // Similar to connect, this is a stub for interface conformance.
        // Actual disconnection is handled by AudioGraphConnectorService or NativeNodeManager.
        console.warn(`${this.constructor.name}.disconnect(dest, outIdx=${outputIndex}) called. This is generally a stub. Disconnections are managed externally.`);
    }
}
