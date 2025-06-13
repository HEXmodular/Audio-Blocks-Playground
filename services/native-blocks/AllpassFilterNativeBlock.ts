import { BlockDefinition, BlockParameter } from '@interfaces/common';
import { ManagedNativeNodeInfo, AllpassInternalNodes } from '@services/NativeNodeManager'; // AllpassInternalNodes is crucial here
import { CreatableNode } from './CreatableNode';

export class AllpassFilterNativeBlock extends CreatableNode {
    constructor(audioContext: AudioContext | null) {
        super(audioContext);
    }

    createNode(
        instanceId: string,
        definition: BlockDefinition,
        // initialParams: BlockParameter[]
        // currentBpm is not used
    ): ManagedNativeNodeInfo {
        if (!this.audioContext) {
            throw new Error("AudioContext is not initialized for AllpassFilterNativeBlock.");
        }

        const apInputPassthrough = this.audioContext.createGain();
        const apInputGain1 = this.audioContext.createGain();
        const apInputDelay = this.audioContext.createDelay(1.0); // Max delay time
        const apFeedbackGain = this.audioContext.createGain();
        const apFeedbackDelay = this.audioContext.createDelay(1.0); // Max delay time
        const apSummingNode = this.audioContext.createGain();

        // Connections for the all-pass structure
        apInputGain1.connect(apInputDelay);
        apInputDelay.connect(apSummingNode);
        apInputPassthrough.connect(apSummingNode); // Dry signal mixed in

        // Feedback loop
        apSummingNode.connect(apFeedbackDelay);
        apFeedbackDelay.connect(apFeedbackGain);
        apFeedbackGain.connect(apSummingNode); // Feedback to summing node (or input of delay, depending on specific AP structure)
                                            // Original NativeNodeManager connects feedbackGain to apSummingNode.

        const allpassNodes: AllpassInternalNodes = {
            inputPassthroughNode: apInputPassthrough,
            inputGain1: apInputGain1,
            inputDelay: apInputDelay,
            feedbackGain: apFeedbackGain,
            feedbackDelay: apFeedbackDelay,
            summingNode: apSummingNode
        };

        const paramTargets = new Map<string, AudioParam>();
        // The 'delayTime' parameter controls both delay lines.
        // The 'coefficient' parameter controls gains for the all-pass effect.
        // Note: The original code sets delayTime on apInputDelay.delayTime and apFeedbackDelay.delayTime.
        // For CV control via paramTargets, we need to pick one or manage both if NativeNodeManager did.
        // Typically, for an all-pass, both delays are identical. Let's target apInputDelay.delayTime
        // and ensure updateNodeParams handles setting both if needed.
        paramTargets.set('delayTime', apInputDelay.delayTime);
        // 'coefficient' is not a direct AudioParam; it controls gains on inputPassthroughNode and feedbackGain.
        // This will be handled in updateNodeParams.

        return {
            nodeForInputConnections: apInputGain1, // Audio input goes into the primary path.
            nodeForOutputConnections: apSummingNode, // Output is taken from the summing node.
            mainProcessingNode: undefined, // No single "main" node, structure is key. Or perhaps summingNode?
            internalGainNode: undefined, // Not applicable in the same way as for oscillators.
            allpassInternalNodes: allpassNodes, // Store the internal structure.
            paramTargetsForCv: paramTargets,
            definition: definition,
            instanceId: instanceId,
        };
    }

    updateNodeParams(
        info: ManagedNativeNodeInfo,
        parameters: BlockParameter[]
        // currentInputs and currentBpm are not used
    ): void {
        if (!this.audioContext || !info.allpassInternalNodes) {
            console.warn(`[AllpassFilterNativeBlock Update] AudioContext not ready or internal nodes not present for instance ${info.instanceId}.`);
            return;
        }

        const { inputDelay, feedbackDelay, inputPassthroughNode, feedbackGain } = info.allpassInternalNodes;

        parameters.forEach(param => {
            if (param.id === 'delayTime' && typeof param.currentValue === 'number') {
                // Both delay times are typically kept equal in an all-pass filter.
                inputDelay.delayTime.setTargetAtTime(param.currentValue, this.audioContext!.currentTime, 0.01);
                feedbackDelay.delayTime.setTargetAtTime(param.currentValue, this.audioContext!.currentTime, 0.01);

                // If 'delayTime' was added to paramTargetsForCv (e.g., targeting inputDelay.delayTime),
                // this explicit setting might be redundant or complementary.
                // The original code set it directly.
            } else if (param.id === 'coefficient' && typeof param.currentValue === 'number') {
                // Coefficient 'k': y[n] = k*x[n] + x[n-D] - k*y[n-D]
                // inputPassthroughNode handles the k*x[n] part (feedforward of input, scaled)
                // feedbackGain handles the -k*y[n-D] part (feedback of output, scaled)
                // The original NativeNodeManager set:
                // allpassInternalNodes.inputPassthroughNode.gain to -param.currentValue (this seems unusual, typically positive)
                // allpassInternalNodes.feedbackGain.gain to param.currentValue
                // Let's re-verify the standard all-pass structure gain settings.
                // A common form is: H(z) = (k + z^-D) / (1 + k*z^-D)
                // This implies inputGain1 might be 1, inputPassthrough (feedforward of input x[n]) gain is 'k',
                // and feedbackGain (from output y[n-D]) is '-k'.
                // Or, if H(z) = (-k + z^-D) / (1 - k*z^-D), then inputPassthrough gain is -k, feedbackGain is k.
                // The original code used:
                // inputPassthroughNode.gain = -coefficient (controls direct path contribution)
                // feedbackGain.gain = coefficient (controls feedback contribution)
                // inputGain1.gain = 1 (implicitly, or could be set if structure varies)
                // This configuration seems to implement H(z) = (z^-D - k) / (1 - k z^-D)
                // (assuming inputGain1 is where x[n] enters before splitting to delay and passthrough scaling)
                // Let's stick to the original implementation's gain logic for now.
                inputPassthroughNode.gain.setTargetAtTime(-param.currentValue, this.audioContext!.currentTime, 0.01);
                feedbackGain.gain.setTargetAtTime(param.currentValue, this.audioContext!.currentTime, 0.01);
            }
        });
    }

    connect(destination: AudioNode): void {
        if (this.audioContext && this.isContextInitialized()) {
            const info = {} as ManagedNativeNodeInfo; // Placeholder, real info would be needed
            // In a real scenario, you'd get the actual output node from ManagedNativeNodeInfo
            // For Allpass, this is typically info.allpassInternalNodes.summingNode or info.nodeForOutputConnections
            // This is a stub, so actual connection logic might be more complex or managed elsewhere.
            const outputNode = info.nodeForOutputConnections || info.allpassInternalNodes?.summingNode;
            if (outputNode) {
                outputNode.connect(destination);
                console.log(`${this.constructor.name} connected to ${destination.constructor.name}`);
            } else {
                console.warn(`${this.constructor.name}: Output node not available for connection.`);
            }
        } else {
            console.warn(`${this.constructor.name}: AudioContext not initialized. Cannot connect.`);
        }
    }

    disconnect(destination: AudioNode): void {
        if (this.audioContext && this.isContextInitialized()) {
            const info = {} as ManagedNativeNodeInfo; // Placeholder
            const outputNode = info.nodeForOutputConnections || info.allpassInternalNodes?.summingNode;
            if (outputNode) {
                try {
                    outputNode.disconnect(destination);
                    console.log(`${this.constructor.name} disconnected from ${destination.constructor.name}`);
                } catch (e) {
                    console.warn(`${this.constructor.name}: Error disconnecting - ${ (e as Error).message}`);
                }
            } else {
                console.warn(`${this.constructor.name}: Output node not available for disconnection.`);
            }
        } else {
            console.warn(`${this.constructor.name}: AudioContext not initialized. Cannot disconnect.`);
        }
    }
}
