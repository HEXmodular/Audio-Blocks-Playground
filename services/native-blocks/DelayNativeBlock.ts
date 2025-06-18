import * as Tone from 'tone';
import { BlockDefinition, BlockParameter, ManagedNativeNodeInfo as OriginalManagedNativeNodeInfo } from '@interfaces/common';
import { createParameterDefinitions } from '../../constants/constants';
import { CreatableNode } from './CreatableNode';

export interface ManagedDelayNodeInfo extends OriginalManagedNativeNodeInfo {
  toneFeedbackDelay?: Tone.FeedbackDelay;
}

export class DelayNativeBlock implements CreatableNode {
    // Context is assumed to be managed globally

    static getDefinition(): BlockDefinition {
      return {
        id: 'tone-feedback-delay-v1', // Changed ID
        name: 'Feedback Delay (Tone)', // Changed name
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
          { id: 'delayTime', name: 'Delay Time (s)', type: 'slider', min: 0, max: 5, step: 0.001, defaultValue: 0.25, description: 'Delay time in seconds.' }, // Max matches previous, Tone.FeedbackDelay maxDelay needs to be set
          { id: 'feedback', name: 'Feedback', type: 'slider', min: 0, max: 0.99, step: 0.01, defaultValue: 0.5, description: 'Feedback amount (0 to 0.99).' }, // Max < 1 to prevent runaway
          { id: 'wet', name: 'Wet Mix', type: 'slider', min: 0, max: 1, step: 0.01, defaultValue: 0.5, description: 'Wet/dry mix (0 dry, 1 wet).' }
        ]),
        logicCode: "",
      };
    }

    constructor() {
        // Global Tone.context is assumed
    }

    setAudioContext(_context: Tone.Context | null): void {
        // May not be needed
    }

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
        // Max delay time for Tone.FeedbackDelay constructor. Default is 1s.
        const maxDelayTime = 5.0; // Match previous native node's max delay capability

        const toneFeedbackDelay = new Tone.FeedbackDelay({
            delayTime: initialDelayTime,
            feedback: initialFeedback,
            maxDelay: maxDelayTime
        });

        // Set initial wet mix separately as it's not a constructor arg for FeedbackDelay itself
        const initialWet = initialParams.find(p => p.id === 'wet')?.currentValue as number ?? 0.5;
        toneFeedbackDelay.wet.value = initialWet;


        const paramTargetsForCv = new Map<string, Tone.Param | Tone.Signal<any>>();
        paramTargetsForCv.set('delayTime', toneFeedbackDelay.delayTime);
        paramTargetsForCv.set('feedback', toneFeedbackDelay.feedback);
        paramTargetsForCv.set('wet', toneFeedbackDelay.wet);

        // Apply all initial parameters via updateNodeParams to ensure consistency
        this.updateNodeParams(
            {
                definition,
                instanceId,
                toneFeedbackDelay,
                nodeForInputConnections: toneFeedbackDelay,
                nodeForOutputConnections: toneFeedbackDelay,
                paramTargetsForCv,
                node: undefined,
                mainProcessingNode: undefined,
            } as ManagedDelayNodeInfo,
            initialParams
        );

        return {
            toneFeedbackDelay,
            nodeForInputConnections: toneFeedbackDelay,
            nodeForOutputConnections: toneFeedbackDelay,
            paramTargetsForCv,
            definition,
            instanceId,
            node: undefined,
            mainProcessingNode: undefined,
        };
    }

    updateNodeParams(
        nodeInfo: ManagedDelayNodeInfo,
        parameters: BlockParameter[]
    ): void {
        if (!nodeInfo.toneFeedbackDelay) {
            console.warn('Tone.FeedbackDelay node not found in nodeInfo for DelayNativeBlock', nodeInfo);
            return;
        }
        const toneFeedbackDelay = nodeInfo.toneFeedbackDelay;
        const context = Tone.getContext();

        parameters.forEach(param => {
            switch (param.id) {
                case 'delayTime':
                    toneFeedbackDelay.delayTime.setTargetAtTime(Number(param.currentValue), context.currentTime, 0.01);
                    break;
                case 'feedback':
                    toneFeedbackDelay.feedback.setTargetAtTime(Number(param.currentValue), context.currentTime, 0.01);
                    break;
                case 'wet':
                    toneFeedbackDelay.wet.setTargetAtTime(Number(param.currentValue), context.currentTime, 0.01);
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

    connect(_destination: Tone.ToneAudioNode | AudioParam, _outputIndex?: number, _inputIndex?: number): void {
        console.warn(`DelayNativeBlock.connect called. Connections typically managed by AudioGraphConnectorService.`);
    }

    disconnect(_destination?: Tone.ToneAudioNode | AudioParam | number, _output?: number, _input?: number): void {
        console.warn(`DelayNativeBlock.disconnect called. Connections typically managed by AudioGraphConnectorService.`);
    }
}
