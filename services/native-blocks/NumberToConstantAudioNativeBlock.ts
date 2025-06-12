import { BlockDefinition, BlockParameter } from '@interfaces/common';
import { ManagedNativeNodeInfo } from '@services/NativeNodeManager';
import { CreatableNode } from './CreatableNode';

export class NumberToConstantAudioNativeBlock extends CreatableNode {
    constructor(audioContext: AudioContext | null) {
        super(audioContext);
    }

    createNode(
        instanceId: string,
        definition: BlockDefinition,
        initialParams: BlockParameter[]
        // currentBpm is not used
    ): ManagedNativeNodeInfo {
        if (!this.audioContext) {
            throw new Error("AudioContext is not initialized for NumberToConstantAudioNativeBlock.");
        }

        const constSrcNode = this.audioContext.createConstantSource();
        constSrcNode.offset.value = 0; // Initial value, will be updated based on input.
        constSrcNode.start();

        // An internal gain node is used to connect the ConstantSourceNode to,
        // and this internal gain node becomes the output. This matches the original structure.
        // This might be for level scaling or simply as a connection point.
        const internalGain = this.audioContext.createGain();
        constSrcNode.connect(internalGain);

        const paramTargets = new Map<string, AudioParam>();
        // The 'gain' of the internalGain can be a parameter, as in the original.
        // The actual value being converted is applied to constSrcNode.offset.
        paramTargets.set('gain', internalGain.gain);


        return {
            nodeForInputConnections: internalGain, // Or constSrcNode? Original had input to internalGain. This seems like an output.
                                                 // This block doesn't take audio input. It takes a number via `currentInputs` in `updateNodeParams`.
                                                 // So, nodeForInputConnections is somewhat moot for audio.
                                                 // Let's clarify: the internalGain is the output.
                                                 // The NativeNodeManager used internalGain for both input and output connections for this block type.
                                                 // This implies that while it doesn't process incoming audio, it might be part of a chain.
            nodeForOutputConnections: internalGain,
            mainProcessingNode: constSrcNode, // The ConstantSourceNode is the core element.
            internalGainNode: internalGain,   // Store the internal gain.
            constantSourceValueNode: constSrcNode, // Specific reference for this type.
            paramTargetsForCv: paramTargets,
            definition: definition,
            instanceId: instanceId,
        };
    }

    updateNodeParams(
        info: ManagedNativeNodeInfo,
        parameters: BlockParameter[],
        currentInputs?: Record<string, any>
        // currentBpm is not used
    ): void {
        if (!this.audioContext || !info.constantSourceValueNode || !(info.constantSourceValueNode instanceof ConstantSourceNode) || !info.internalGainNode) {
            console.warn(`[NumToConstAudio Update] AudioContext not ready or essential nodes not present for instance ${info.instanceId}.`);
            return;
        }

        const constSrcNode = info.constantSourceValueNode as ConstantSourceNode;

        // Handle parameters for the internal gain node, if any (like a master volume for this block)
        parameters.forEach(param => {
            const targetAudioParam = info.paramTargetsForCv?.get(param.id);
            if (targetAudioParam) { // This would be for the internalGain.gain
                if (typeof param.currentValue === 'number') {
                    targetAudioParam.setTargetAtTime(param.currentValue, this.audioContext!.currentTime, 0.01);
                }
            }
        });

        // Handle the 'number_in' input which drives the ConstantSourceNode's offset
        if (currentInputs && currentInputs.number_in !== undefined) {
            const numberIn = Number(currentInputs.number_in);

            // Determine the normalization range from parameters
            const maxExpectedParam = parameters.find(p => p.id === 'max_input_value');
            const maxExpected = maxExpectedParam ? Number(maxExpectedParam.currentValue) : 255; // Default from original code

            // Normalize the input number to the range [-1, 1] for the ConstantSourceNode's offset
            // This specific normalization logic ( (value / max) * 2 - 1 ) is from the original NativeNodeManager
            let normalizedValue = maxExpected !== 0 ? (numberIn / maxExpected) * 2 - 1 : 0;
            normalizedValue = Math.max(-1, Math.min(1, normalizedValue)); // Clamp to [-1, 1]

            constSrcNode.offset.setTargetAtTime(normalizedValue, this.audioContext!.currentTime, 0.01);
        }
    }

    // connect and disconnect are inherited
    // connect(destination: AudioNode): void { /* ... */ }
    // disconnect(destination: AudioNode): void { /* ... */ }
}
