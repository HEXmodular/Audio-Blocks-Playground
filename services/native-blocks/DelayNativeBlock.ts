import { BlockDefinition, BlockParameterDefinition, BlockParameter, ManagedNativeNodeInfo } from '@interfaces/common'; // Updated import
import { createParameterDefinitions } from '../../constants/constants'; // Adjust path as needed
import { CreatableNode } from './CreatableNode';

export class DelayNativeBlock implements CreatableNode {
    private context: AudioContext;

    static getDefinition(): BlockDefinition {
      return {
        id: 'native-delay-v1',
        name: 'Delay (Native)',
        description: 'A standard Web Audio API DelayNode. Audio path is managed by Web Audio graph connections.',
        runsAtAudioRate: true,
        inputs: [
          { id: 'audio_in', name: 'Audio Input', type: 'audio', description: 'Connects to native DelayNode input in Web Audio graph.' },
          { id: 'delay_cv_in', name: 'Delay CV', type: 'audio', description: 'Modulates delayTime AudioParam directly in Web Audio graph.', audioParamTarget: 'delayTime'}
        ],
        outputs: [
          { id: 'audio_out', name: 'Audio Output', type: 'audio', description: 'Output from native DelayNode in Web Audio graph.' }
        ],
        parameters: createParameterDefinitions([
          { id: 'delayTime', name: 'Delay Time (s)', type: 'slider', min: 0, max: 5, step: 0.001, defaultValue: 0.5, description: 'Delay in seconds (AudioParam). Max effective delay fixed at node creation (e.g. 5s by default in engine).' },
        ]),
        logicCode: "",
      };
    }

    constructor(context: AudioContext) {
        this.context = context;
    }

    setAudioContext(context: AudioContext | null): void {
        this.context = context!;
    }

    createNode(
        instanceId: string,
        definition: BlockDefinition,
        initialParams: BlockParameter[]
    ): ManagedNativeNodeInfo {
        if (!this.context) throw new Error("AudioContext not initialized");
        // Max delay time of 5 seconds, can be configured if needed
        const delayNode = this.context.createDelay(5.0);

        const paramTargetsForCv = new Map<string, AudioParam>();
        paramTargetsForCv.set('delayTime', delayNode.delayTime);

        // Apply initial parameters
        initialParams.forEach(param => {
            if (param.id === 'delayTime') {
                delayNode.delayTime.value = Number(param.currentValue);
            }
        });

        return {
            node: delayNode, // The DelayNode itself is the main node
            nodeForInputConnections: delayNode,
            nodeForOutputConnections: delayNode,
            mainProcessingNode: delayNode,
            paramTargetsForCv,
            definition,
            instanceId,
        };
    }

    updateNodeParams(
        nodeInfo: ManagedNativeNodeInfo,
        parameters: BlockParameter[]
    ): void {
        if (!this.context || !(nodeInfo.mainProcessingNode instanceof DelayNode)) return;
        const delayNode = nodeInfo.mainProcessingNode;

        parameters.forEach(param => {
            if (param.id === 'delayTime' && delayNode.delayTime) {
                delayNode.delayTime.setTargetAtTime(Number(param.currentValue), this.context!.currentTime, 0.01);
            }
        });
    }

    connect(_destination: AudioNode | AudioParam, _outputIndex?: number, _inputIndex?: number): void {
        console.warn(`DelayNativeBlock.connect called directly on instance. This should be handled by AudioGraphConnectorService.`);
    }

    disconnect(_destination?: AudioNode | AudioParam | number, _output?: number, _input?: number): void {
        console.warn(`DelayNativeBlock.disconnect called directly on instance. This should be handled by AudioGraphConnectorService or by the manager's removeManagedNativeNode.`);
    }
}
