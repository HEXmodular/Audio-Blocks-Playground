import { BlockDefinition, BlockParameter, ManagedNativeNodeInfo } from '@interfaces/common';
import { CreatableNode } from './CreatableNode';
import { createParameterDefinitions } from '@constants/constants';

export const GAIN_BLOCK_DEFINITION: BlockDefinition = {
    id: 'native-gain-v1',
    name: 'Gain Control (Native)',
    description: 'A native Web Audio API GainNode. Controls signal amplitude. Audio path is managed by Web Audio graph connections.',
    runsAtAudioRate: true,
    inputs: [
        { id: 'audio_in', name: 'Audio Input', type: 'audio', description: 'Connects to native GainNode input in Web Audio graph.' },
        { id: 'gain_cv_in', name: 'Gain CV', type: 'audio', description: 'Modulates gain AudioParam directly in Web Audio graph.', audioParamTarget: 'gain' }
    ],
    outputs: [
        { id: 'audio_out', name: 'Audio Output', type: 'audio', description: 'Output from native GainNode in Web Audio graph.' }
    ],
    parameters: createParameterDefinitions([
        { id: 'gain', name: 'Gain', type: 'slider', min: 0, max: 2, step: 0.01, defaultValue: 1, description: 'Signal amplitude (AudioParam).' }
    ]),
    logicCode: "// Native GainNode is managed by the audio engine.", // Re-added
    initialPrompt: "This block is a native Web Audio GainNode.",    // Re-added
};


export class GainControlNativeBlock implements CreatableNode {
    private context: AudioContext | null;

    constructor(context: AudioContext | null) {
        this.context = context;
    }

    setAudioContext(context: AudioContext | null): void {
        this.context = context;
    }

    createNode(
        instanceId: string,
        definition: BlockDefinition,
        initialParams: BlockParameter[],
        _currentBpm?: number
    ): ManagedNativeNodeInfo {
        if (!this.context) throw new Error("AudioContext not initialized for GainControlNativeBlock");
        const gainNode = this.context.createGain();

        const gainParam = initialParams.find(p => p.id === 'gain');
        gainNode.gain.value = gainParam ? Number(gainParam.currentValue) : 1;

        const paramTargetsForCv = new Map<string, AudioParam>();
        paramTargetsForCv.set('gain', gainNode.gain);

        return {
            node: gainNode,
            nodeForInputConnections: gainNode,
            nodeForOutputConnections: gainNode,
            mainProcessingNode: gainNode,
            paramTargetsForCv,
            definition,
            instanceId,
        };
    }

    updateNodeParams(
        nodeInfo: ManagedNativeNodeInfo,
        parameters: BlockParameter[],
        _currentInputs?: Record<string, any>,
        _currentBpm?: number
    ): void {
        if (!this.context || !(nodeInfo.mainProcessingNode instanceof GainNode)) return;
        const gainNode = nodeInfo.mainProcessingNode;

        const gainParam = parameters.find(p => p.id === 'gain');
        if (gainParam && gainNode.gain) {
            gainNode.gain.setTargetAtTime(Number(gainParam.currentValue), this.context.currentTime, 0.01);
        }
    }

    connect(_destination: AudioNode | AudioParam, _outputIndex?: number, _inputIndex?: number): void {
        console.warn(`GainControlNativeBlock.connect called directly on instance. This should be handled by AudioGraphConnectorService.`);
    }

    disconnect(_destination?: AudioNode | AudioParam | number, _output?: number, _input?: number): void {
        console.warn(`GainControlNativeBlock.disconnect called directly on instance. This should be handled by AudioGraphConnectorService or by the manager's removeManagedNativeNode.`);
    }
}
