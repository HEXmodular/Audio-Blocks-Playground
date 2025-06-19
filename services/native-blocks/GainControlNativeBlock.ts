import * as Tone from 'tone';
import { BlockDefinition, BlockParameter, ManagedNativeNodeInfo as OriginalManagedNativeNodeInfo } from '@interfaces/common';
// AudioParam is a global type, removed from common import
import { CreatableNode } from './CreatableNode';
import { createParameterDefinitions } from '@constants/constants';

export interface ManagedGainNodeInfo extends OriginalManagedNativeNodeInfo {
  toneGain?: Tone.Gain;
}

export class GainControlNativeBlock implements CreatableNode {
    public static getDefinition(): BlockDefinition {
      return {
        id: 'tone-gain-v1',
        name: 'Gain Control (Tone)',
        description: 'A Tone.Gain node. Controls signal amplitude.',
        runsAtAudioRate: true,
        inputs: [
          { id: 'audio_in', name: 'Audio Input', type: 'audio', description: 'Connects to Tone.Gain input.' },
          { id: 'gain_cv_in', name: 'Gain CV', type: 'audio', description: 'Modulates gain (Tone.Param).', audioParamTarget: 'gain' }
        ],
        outputs: [
          { id: 'audio_out', name: 'Audio Output', type: 'audio', description: 'Output from Tone.Gain.' }
        ],
        parameters: createParameterDefinitions([
          { id: 'gain', name: 'Gain', type: 'slider', min: 0, max: 2, step: 0.01, defaultValue: 1, description: 'Signal amplitude (linear gain).' }
        ]),
        compactRendererId: 'gain',
      };
    }

    constructor() {}

    setAudioContext(_context: any): void {}

    createNode(
        instanceId: string,
        definition: BlockDefinition,
        initialParams: BlockParameter[],
        _currentBpm?: number
    ): ManagedGainNodeInfo {
        if (Tone.getContext().state !== 'running') {
            console.warn('Tone.js context is not running. Gain node may not function correctly until context is started.');
        }

        const toneGain = new Tone.Gain();

        // paramTargetsForCv map requires AudioParam in its union type from ManagedNativeNodeInfo
        const specificParamTargetsForCv = new Map<string, AudioParam | Tone.Param<any> | Tone.Signal<any>>([
            ['gain', toneGain.gain as unknown as Tone.Param<any>],
        ]);

        const nodeInfo: ManagedGainNodeInfo = {
            definition,
            instanceId,
            toneGain,
            node: toneGain as unknown as Tone.ToneAudioNode,
            nodeForInputConnections: toneGain as unknown as Tone.ToneAudioNode,
            nodeForOutputConnections: toneGain as unknown as Tone.ToneAudioNode,
            mainProcessingNode: toneGain as unknown as Tone.ToneAudioNode,
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
        nodeInfo: ManagedGainNodeInfo,
        parameters: BlockParameter[],
        _currentInputs?: Record<string, any>,
        _currentBpm?: number
    ): void {
        if (!nodeInfo.toneGain) {
            console.warn('Tone.Gain node not found in nodeInfo for GainControlNativeBlock', nodeInfo);
            return;
        }
        const toneGainCurrent = nodeInfo.toneGain;
        const context = Tone.getContext();

        const gainParam = parameters.find(p => p.id === 'gain');
        if (gainParam && toneGainCurrent.gain) {
            const targetGain = Number(gainParam.currentValue);
            toneGainCurrent.gain.setTargetAtTime(targetGain, context.currentTime, 0.01);
        }
    }

    dispose(nodeInfo: ManagedGainNodeInfo): void {
        if (nodeInfo.toneGain) {
            nodeInfo.toneGain.dispose();
            console.log(`Disposed Tone.Gain node for instanceId: ${nodeInfo.instanceId}`);
        }
    }

    connect(_destination: any, _outputIndex?: number, _inputIndex?: number): any {
        console.warn(`GainControlNativeBlock.connect called. Connections typically managed by AudioGraphConnectorService.`);
    }

    disconnect(_destination?: any, _output?: number, _input?: number): void {
        console.warn(`GainControlNativeBlock.disconnect called. Connections typically managed by AudioGraphConnectorService.`);
    }
}
