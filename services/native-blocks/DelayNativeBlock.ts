import * as Tone from 'tone';
import { BlockDefinition, BlockParameter, ManagedNativeNodeInfo as OriginalManagedNativeNodeInfo } from '@interfaces/common';
// AudioParam is a global type
import { createParameterDefinitions } from '../../constants/constants';
import { CreatableNode } from './CreatableNode';

export interface ManagedDelayNodeInfo extends OriginalManagedNativeNodeInfo {
  toneFeedbackDelay?: Tone.FeedbackDelay;
}

export class DelayNativeBlock implements CreatableNode {
    static getDefinition(): BlockDefinition {
      return {
        id: 'tone-feedback-delay-v1',
        name: 'Feedback Delay (Tone)',
        description: 'A Tone.FeedbackDelay node, providing delay with feedback and wet/dry mix.',
        runsAtAudioRate: true,
        inputs: [
          { id: 'audio_in', name: 'Audio Input', type: 'audio', description: 'Connects to Tone.FeedbackDelay input.' },
          { id: 'delay_cv_in', name: 'Delay Time CV', type: 'audio', description: 'Modulates delay time (Tone.Param).', audioParamTarget: 'delayTime'},
          { id: 'feedback_cv_in', name: 'Feedback CV', type: 'audio', description: 'Modulates feedback amount (Tone.Signal).', audioParamTarget: 'feedback'},
          { id: 'wet_cv_in', name: 'Wet Mix CV', type: 'audio', description: 'Modulates wet/dry mix (Tone.Signal).', audioParamTarget: 'wet'}
        ],
        outputs: [
          { id: 'audio_out', name: 'Audio Output', type: 'audio', description: 'Output from Tone.FeedbackDelay.' }
        ],
        parameters: createParameterDefinitions([
          { id: 'delayTime', name: 'Delay Time (s)', type: 'slider', min: 0, max: 5, step: 0.001, defaultValue: 0.25, description: 'Delay time in seconds.' },
          { id: 'feedback', name: 'Feedback', type: 'slider', min: 0, max: 0.99, step: 0.01, defaultValue: 0.5, description: 'Feedback amount (0 to 0.99).' },
          { id: 'wet', name: 'Wet Mix', type: 'slider', min: 0, max: 1, step: 0.01, defaultValue: 0.5, description: 'Wet/dry mix (0 dry, 1 wet).' }
        ]),
        logicCode: "",
      };
    }

    constructor() {}

    setAudioContext(_context: any): void {}

    createNode(
        instanceId: string,
        definition: BlockDefinition,
        initialParams: BlockParameter[]
    ): ManagedDelayNodeInfo {
        if (Tone.getContext().state !== 'running') {
            console.warn('Tone.js context is not running. Delay node may not function correctly.');
        }

        const initialDelayTime = initialParams.find(p => p.id === 'delayTime')?.currentValue as number ?? 0.25;
        const initialFeedback = initialParams.find(p => p.id === 'feedback')?.currentValue as number ?? 0.5;
        const maxDelayTime = 5.0;

        const toneFeedbackDelay = new Tone.FeedbackDelay({
            delayTime: initialDelayTime,
            feedback: initialFeedback,
            maxDelay: maxDelayTime
        });

        const initialWet = initialParams.find(p => p.id === 'wet')?.currentValue as number ?? 0.5;
        toneFeedbackDelay.wet.value = initialWet;

        const specificParamTargetsForCv = new Map<string, AudioParam | Tone.Param<any> | Tone.Signal<any>>([
            ['delayTime', toneFeedbackDelay.delayTime as unknown as Tone.Param<any>],
            ['feedback', toneFeedbackDelay.feedback],
            ['wet', toneFeedbackDelay.wet]
        ]);

        const nodeInfo: ManagedDelayNodeInfo = {
            definition,
            instanceId,
            toneFeedbackDelay,
            node: toneFeedbackDelay as unknown as Tone.ToneAudioNode,
            nodeForInputConnections: toneFeedbackDelay as unknown as Tone.ToneAudioNode,
            nodeForOutputConnections: toneFeedbackDelay as unknown as Tone.ToneAudioNode,
            mainProcessingNode: toneFeedbackDelay as unknown as Tone.ToneAudioNode,
            paramTargetsForCv: specificParamTargetsForCv,
            internalGainNode: undefined,
            allpassInternalNodes: undefined,
            constantSourceValueNode: undefined,
            internalState: {},
        };
        this.updateNodeParams(nodeInfo, initialParams);

        return nodeInfo;
    }

    updateNodeParams(
        nodeInfo: ManagedDelayNodeInfo,
        parameters: BlockParameter[],
        _currentInputs?: Record<string, any>,
        _currentBpm?: number
    ): void {
        if (!nodeInfo.toneFeedbackDelay) {
            console.warn('Tone.FeedbackDelay node not found in nodeInfo for DelayNativeBlock', nodeInfo);
            return;
        }
        const currentToneFeedbackDelay = nodeInfo.toneFeedbackDelay;
        const context = Tone.getContext();

        parameters.forEach(param => {
            switch (param.id) {
                case 'delayTime':
                    currentToneFeedbackDelay.delayTime.setTargetAtTime(Number(param.currentValue), context.currentTime, 0.01);
                    break;
                case 'feedback':
                    currentToneFeedbackDelay.feedback.setTargetAtTime(Number(param.currentValue), context.currentTime, 0.01);
                    break;
                case 'wet':
                    currentToneFeedbackDelay.wet.setTargetAtTime(Number(param.currentValue), context.currentTime, 0.01);
                    break;
            }
        });
    }

    dispose(nodeInfo: ManagedDelayNodeInfo): void {
        if (nodeInfo.toneFeedbackDelay) {
            nodeInfo.toneFeedbackDelay.dispose();
            console.log(`Disposed Tone.FeedbackDelay node for instanceId: ${nodeInfo.instanceId}`);
        }
    }

    connect(_destination: any, _outputIndex?: number, _inputIndex?: number): any {
        console.warn(`DelayNativeBlock.connect called. Connections typically managed by AudioGraphConnectorService.`);
    }

    disconnect(_destination?: any, _output?: number, _input?: number): void {
        console.warn(`DelayNativeBlock.disconnect called. Connections typically managed by AudioGraphConnectorService.`);
    }
}
