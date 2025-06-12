import { BlockDefinition, BlockParameter } from '@interfaces/common';
import { ManagedNativeNodeInfo, AllpassInternalNodes } from '@interfaces/common'; // Updated import
import { CreatableNode } from './CreatableNode';

export class AllpassFilterNativeBlock implements CreatableNode {
    private context: AudioContext;
    private internalNodes: AllpassInternalNodes | null = null;

    constructor(context: AudioContext) {
        this.context = context;
    }

    setAudioContext(context: AudioContext | null): void {
        this.context = context!; // TODO: Handle null context more gracefully if needed
    }

    createNode(
        instanceId: string,
        definition: BlockDefinition,
        _initialParams: BlockParameter[]
    ): ManagedNativeNodeInfo {
        if (!this.context) throw new Error("AudioContext not initialized");

        const inputPassthroughNode = this.context.createGain();
        const inputGain1 = this.context.createGain();
        const inputDelay = this.context.createDelay(1.0); // Max delay of 1 second
        const feedbackGain = this.context.createGain();
        const feedbackDelay = this.context.createDelay(1.0);
        const summingNode = this.context.createGain();

        // Configure connections for the all-pass filter structure
        // y[n] = -g*x[n] + x[n-M] + g*y[n-M]
        // This typically involves:
        // Input -> to +1 gain (inputPassthroughNode to summingNode)
        // Input -> to -g gain (inputGain1 to summingNode)
        // Input -> to Delay M (inputDelay) -> to summingNode
        // Output of summingNode (y[n]) -> to feedbackDelay M -> to feedbackGain (g) -> back to summingNode input

        // Simplified direct path for x[n-M]
        inputPassthroughNode.connect(inputDelay);
        inputDelay.connect(summingNode);

        // Path for -g*x[n]
        inputPassthroughNode.connect(inputGain1);
        inputGain1.connect(summingNode);
        inputGain1.gain.value = -1; // Will be modulated by 'coefficient' param

        // Feedback path g*y[n-M]
        summingNode.connect(feedbackDelay);
        feedbackDelay.connect(feedbackGain);
        feedbackGain.connect(summingNode);

        this.internalNodes = {
            inputPassthroughNode,
            inputGain1,
            inputDelay,
            feedbackGain,
            feedbackDelay,
            summingNode,
        };

        const paramTargetsForCv = new Map<string, AudioParam>();
        paramTargetsForCv.set('delayTime', inputDelay.delayTime); // Main delay control
        paramTargetsForCv.set('coefficient', feedbackGain.gain); // 'g' coefficient for feedback and inputGain1
                                                                // Note: inputGain1 also needs to be controlled by 'coefficient' but negatively.
                                                                // This might require separate handling in updateNodeParams or a more complex graph.

        return {
            node: inputPassthroughNode, // Main input node
            nodeForInputConnections: inputPassthroughNode,
            nodeForOutputConnections: summingNode, // Main output node
            mainProcessingNode: summingNode, // Or identify a central node if applicable
            allpassInternalNodes: this.internalNodes,
            paramTargetsForCv,
            definition,
            instanceId,
        };
    }

    updateNodeParams(
        nodeInfo: ManagedNativeNodeInfo,
        parameters: BlockParameter[],
        _currentInputs?: Record<string, any> | undefined
    ): void {
        if (!this.context || !nodeInfo.allpassInternalNodes) return;

        const delayTimeParam = parameters.find(p => p.id === 'delayTime');
        const coefficientParam = parameters.find(p => p.id === 'coefficient');

        if (delayTimeParam && nodeInfo.allpassInternalNodes.inputDelay.delayTime && nodeInfo.allpassInternalNodes.feedbackDelay.delayTime) {
            const delayValue = Math.max(0.0001, Math.min(1.0, Number(delayTimeParam.currentValue))); // Clamp to typical allpass values
            nodeInfo.allpassInternalNodes.inputDelay.delayTime.setValueAtTime(delayValue, this.context.currentTime);
            nodeInfo.allpassInternalNodes.feedbackDelay.delayTime.setValueAtTime(delayValue, this.context.currentTime);
        }
        if (coefficientParam && nodeInfo.allpassInternalNodes.feedbackGain.gain && nodeInfo.allpassInternalNodes.inputGain1.gain) {
            const g = Number(coefficientParam.currentValue);
            nodeInfo.allpassInternalNodes.feedbackGain.gain.setValueAtTime(g, this.context.currentTime);
            nodeInfo.allpassInternalNodes.inputGain1.gain.setValueAtTime(-g, this.context.currentTime); // Inverted gain for the feedforward path
        }
    }

    // Placeholder implementations for connect and disconnect
    connect(_destination: AudioNode | AudioParam, _outputIndex?: number | undefined, _inputIndex?: number | undefined): void {
        // This specific block's output is via nodeInfo.nodeForOutputConnections (summingNode)
        // The actual connection logic is handled by AudioGraphConnectorService based on the returned ManagedNativeNodeInfo.
        console.warn(`AllpassFilterNativeBlock.connect called directly on instance for ${this.internalNodes}, but should be handled by AudioGraphConnectorService.`);
    }

    disconnect(_destination?: AudioNode | AudioParam | number | undefined, _output?: number | undefined, _input?: number | undefined): void {
        // Similar to connect, disconnection is managed by AudioGraphConnectorService.
        // However, internal nodes should be disconnected if the block instance is removed.
        console.warn(`AllpassFilterNativeBlock.disconnect called directly on instance for ${this.internalNodes}. Disconnection is typically managed by AudioGraphConnectorService or by the manager's removeManagedNativeNode.`);
        if (this.internalNodes) {
            Object.values(this.internalNodes).forEach(node => {
                try { node.disconnect(); } catch(e) { /* ignore if already disconnected or error */ }
            });
        }
    }
}
