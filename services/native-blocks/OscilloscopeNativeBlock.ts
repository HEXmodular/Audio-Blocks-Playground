import { BlockDefinition, BlockParameter } from '../../../types';
import { ManagedNativeNodeInfo } from '../../NativeNodeManager';
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

    // connect and disconnect are inherited, commented out
    // connect(destination: AudioNode): void { /* ... */ }
    // disconnect(destination: AudioNode): void { /* ... */ }
}
