import * as Tone from 'tone';
import { BlockDefinition, BlockParameter, ManagedNativeNodeInfo as OriginalManagedNativeNodeInfo } from '@interfaces/common';
import { CreatableNode } from './CreatableNode';
import { createParameterDefinitions } from '@constants/constants';

// Define a more specific type for the managed node info
export interface ManagedGainNodeInfo extends OriginalManagedNativeNodeInfo {
  toneGain?: Tone.Gain;
}

export class GainControlNativeBlock implements CreatableNode {
    // Context is assumed to be managed globally by AudioContextService
    // private context: Tone.Context | null = null; // Not storing context

    public static getDefinition(): BlockDefinition {
      return {
        id: 'tone-gain-v1', // Changed ID
        name: 'Gain Control (Tone)', // Changed name
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
          // Tone.Gain's gain is a linear value. The existing range 0-2 is fine.
          { id: 'gain', name: 'Gain', type: 'slider', min: 0, max: 2, step: 0.01, defaultValue: 1, description: 'Signal amplitude (linear gain).' }
        ]),
        logicCode: "",
        compactRendererId: 'gain', // Assuming a generic renderer can be adapted
      };
    }

    constructor() {
        // Global Tone.context is assumed.
    }

    setAudioContext(_context: Tone.Context | null): void {
        // This method may not be strictly necessary if relying on global Tone.context
    }

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

        // Apply initial parameters
        this.updateNodeParams(
            {
                definition,
                instanceId,
                toneGain,
                nodeForInputConnections: toneGain, // Input connects to the gain node itself
                nodeForOutputConnections: toneGain, // Output is from the gain node itself
                paramTargetsForCv: new Map<string, Tone.Param<"gain">>([['gain', toneGain.gain]]),
                 // Deprecated/unused from OriginalManagedNativeNodeInfo:
                node: undefined,
                mainProcessingNode: undefined,
            } as ManagedGainNodeInfo, // Type assertion
            initialParams
        );

        return {
            toneGain,
            // For compatibility with graph connection logic
            nodeForInputConnections: toneGain,
            nodeForOutputConnections: toneGain,
            paramTargetsForCv: new Map<string, Tone.Param<"gain">>([['gain', toneGain.gain]]),
            definition,
            instanceId,
            node: undefined, // No direct equivalent to the old 'node'
            mainProcessingNode: undefined, // No direct equivalent
        };
    }

    updateNodeParams(
        nodeInfo: ManagedGainNodeInfo,
        parameters: BlockParameter[],
        _currentInputs?: Record<string, any>, // CV inputs are handled by direct connection
        _currentBpm?: number
    ): void {
        if (!nodeInfo.toneGain) {
            console.warn('Tone.Gain node not found in nodeInfo for GainControlNativeBlock', nodeInfo);
            return;
        }
        const toneGain = nodeInfo.toneGain;
        const context = Tone.getContext();

        const gainParam = parameters.find(p => p.id === 'gain');
        if (gainParam && toneGain.gain) {
            const targetGain = Number(gainParam.currentValue);
            // toneGain.gain.value = targetGain; // Immediate change
            toneGain.gain.setTargetAtTime(targetGain, context.currentTime, 0.01);
        }
    }

    dispose(nodeInfo: ManagedGainNodeInfo): void {
        if (nodeInfo.toneGain) {
            nodeInfo.toneGain.dispose();
            console.log(`Disposed Tone.Gain node for instanceId: ${nodeInfo.instanceId}`);
        }
    }

    connect(_destination: Tone.ToneAudioNode | AudioParam, _outputIndex?: number, _inputIndex?: number): void {
        console.warn(`GainControlNativeBlock.connect called. Connections typically managed by AudioGraphConnectorService.`);
    }

    disconnect(_destination?: Tone.ToneAudioNode | AudioParam | number, _output?: number, _input?: number): void {
        console.warn(`GainControlNativeBlock.disconnect called. Connections typically managed by AudioGraphConnectorService.`);
    }
}
