import { BlockDefinition, BlockParameter, ManagedNativeNodeInfo } from '@interfaces/common';
import { createParameterDefinitions } from '../../constants/constants'; // Adjust path as needed
import { CreatableNode } from './CreatableNode';

export class NumberToConstantAudioNativeBlock implements CreatableNode {
    private context: AudioContext;

    static getDefinition(): BlockDefinition {
      return {
        id: 'number-to-constant-audio-v1',
        name: 'Number to Constant Audio',
        description: 'Converts a number input to a constant audio signal via ConstantSourceNode, with gain control.',
        runsAtAudioRate: true,
        inputs: [ { id: 'number_in', name: 'Number In', type: 'number', description: 'Numeric value to output as constant audio.' } ],
        outputs: [ { id: 'audio_out', name: 'Audio Output', type: 'audio', description: 'Constant audio signal.' } ],
        parameters: createParameterDefinitions([
          { id: 'gain', name: 'Gain', type: 'slider', min: 0, max: 1, step: 0.01, defaultValue: 1, description: 'Gain applied to the constant audio signal.' },
          { id: 'max_input_value', name: 'Max Expected Input', type: 'number_input', min: 1, defaultValue: 255, description: 'Expected maximum of number_in, for normalization to -1 to 1 range before gain.'}
        ]),
      };
    }

    constructor(context: AudioContext) {
        this.context = context;
    }


    createNode(
        instanceId: string,
        definition: BlockDefinition,
        initialParams: BlockParameter[]
    ): ManagedNativeNodeInfo {
        if (!this.context) throw new Error("AudioContext not initialized");

        const constantSourceNode = this.context.createConstantSource();
        constantSourceNode.offset.value = 0; // Initial value, will be updated by inputs/params
        constantSourceNode.start();

        const gainNode = this.context.createGain();
        constantSourceNode.connect(gainNode);

        // Apply initial parameters (specifically gain)
        const gainParam = initialParams.find(p => p.id === 'gain');
        gainNode.gain.value = gainParam ? Number(gainParam.currentValue) : 1;

        // No direct CV targets on ConstantSourceNode.offset via audioParamTarget convention.
        // The 'number_in' input is handled by updateNodeParams.
        const paramTargetsForCv = new Map<string, AudioParam>();
        // If gain were CV controllable, it would be: paramTargetsForCv.set('gain', gainNode.gain);

        return {
            node: constantSourceNode, // The ConstantSourceNode is the core processing node
            nodeForInputConnections: constantSourceNode, // Inputs will update offset
            nodeForOutputConnections: gainNode, // Output is from the gain node
            mainProcessingNode: constantSourceNode,
            internalGainNode: gainNode,
            constantSourceValueNode: constantSourceNode, // Specific for NativeNodeManager to control offset
            paramTargetsForCv,
            definition,
            instanceId,
        };
    }

    updateNodeParams(
        nodeInfo: ManagedNativeNodeInfo,
        parameters: BlockParameter[],
        currentInputs?: Record<string, any>
    ): void {
        if (!this.context || !nodeInfo.constantSourceValueNode || !(nodeInfo.constantSourceValueNode instanceof ConstantSourceNode) || !nodeInfo.internalGainNode) return;

        const constantSource = nodeInfo.constantSourceValueNode;
        const gainNode = nodeInfo.internalGainNode;

        const numberInValue = currentInputs?.['number_in'];
        const gainParam = parameters.find(p => p.id === 'gain');
        const maxExpectedInputParam = parameters.find(p => p.id === 'max_input_value');

        if (gainParam) {
            gainNode.gain.setTargetAtTime(Number(gainParam.currentValue), this.context.currentTime, 0.01);
        }

        if (typeof numberInValue === 'number') {
            let normalizedValue = numberInValue;
            if (maxExpectedInputParam && Number(maxExpectedInputParam.currentValue) !== 0) {
                normalizedValue = numberInValue / Number(maxExpectedInputParam.currentValue);
                normalizedValue = Math.max(-1, Math.min(1, normalizedValue)); // Clamp to [-1, 1]
            }
            constantSource.offset.setTargetAtTime(normalizedValue, this.context.currentTime, 0.01);
        }
    }

    connect(_destination: AudioNode | AudioParam, _outputIndex?: number, _inputIndex?: number): void {
        console.warn(`NumberToConstantAudioNativeBlock.connect called directly. Connections handled by AudioGraphConnectorService.`);
    }

    disconnect(_destination?: AudioNode | AudioParam | number, _output?: number, _input?: number): void {
        console.warn(`NumberToConstantAudioNativeBlock.disconnect called directly. Connections handled by AudioGraphConnectorService/manager.`);
    }
}
