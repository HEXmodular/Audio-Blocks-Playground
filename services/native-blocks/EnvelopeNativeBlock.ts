import { BlockDefinition, BlockParameterDefinition, BlockParameter, ManagedNativeNodeInfo } from '@interfaces/common'; // Updated import
import { createParameterDefinitions } from '../../constants/constants'; // Adjust path as needed
import { CreatableNode } from './CreatableNode';

export class EnvelopeNativeBlock implements CreatableNode {
    private context: AudioContext;

    static getADEnvelopeDefinition(): BlockDefinition {
      return {
        id: 'native-ad-envelope-v1',
        name: 'AD Envelope (Native)',
        description: 'Attack-Decay envelope generator using a native ConstantSourceNode and AudioParam automation. Triggered by input signal.',
        runsAtAudioRate: true,
        inputs: [ { id: 'trigger_in', name: 'Trigger', type: 'trigger', description: 'Triggers the envelope.' } ],
        outputs: [ { id: 'audio_out', name: 'Envelope Output', type: 'audio', description: 'The envelope signal (0 to Peak Level).' } ],
        parameters: createParameterDefinitions([
          { id: 'attackTime', name: 'Attack Time (s)', type: 'slider', min: 0.001, max: 5, step: 0.001, defaultValue: 0.1, description: 'Envelope attack time in seconds.' },
          { id: 'decayTime', name: 'Decay Time (s)', type: 'slider', min: 0.001, max: 5, step: 0.001, defaultValue: 0.3, description: 'Envelope decay time in seconds.' },
          { id: 'peakLevel', name: 'Peak Level', type: 'slider', min: 0, max: 10, step: 0.1, defaultValue: 1, description: 'Peak level of the envelope.' }
        ]),
        logicCode: `
const triggerInputVal = inputs.trigger_in;
let newInternalState = { ...internalState };
if (triggerInputVal === true && (internalState.prevTriggerState === false || internalState.prevTriggerState === undefined || internalState.prevTriggerState === null)) {
  newInternalState.envelopeNeedsTriggering = true;
  __custom_block_logger__('AD Envelope trigger detected. Setting envelopeNeedsTriggering to true.');
}
newInternalState.prevTriggerState = triggerInputVal;
return newInternalState;
        `.trim(),
      };
    }

    static getAREnvelopeDefinition(): BlockDefinition {
      return {
        id: 'native-ar-envelope-v1',
        name: 'AR Envelope (Native)',
        description: 'Attack-Release envelope generator using a native ConstantSourceNode and AudioParam automation. Controlled by a gate input.',
        runsAtAudioRate: true,
        inputs: [ { id: 'gate_in', name: 'Gate', type: 'gate', description: 'Controls the envelope state (high for attack/sustain, low for release).' } ],
        outputs: [ { id: 'audio_out', name: 'Envelope Output', type: 'audio', description: 'The envelope signal (0 to Sustain Level).' } ],
        parameters: createParameterDefinitions([
          { id: 'attackTime', name: 'Attack Time (s)', type: 'slider', min: 0.001, max: 5, step: 0.001, defaultValue: 0.1, description: 'Envelope attack time in seconds.' },
          { id: 'releaseTime', name: 'Release Time (s)', type: 'slider', min: 0.001, max: 5, step: 0.001, defaultValue: 0.5, description: 'Envelope release time in seconds.' },
          { id: 'sustainLevel', name: 'Sustain Level', type: 'slider', min: 0, max: 10, step: 0.1, defaultValue: 0.7, description: 'Sustain level of the envelope (when gate is high).' }
        ]),
        logicCode: `
const gateInputVal = !!inputs.gate_in;
let newInternalState = { ...internalState };
if (gateInputVal === true && (internalState.prevGateState === false || internalState.prevGateState === undefined)) {
  newInternalState.gateStateChangedToHigh = true;
  newInternalState.gateStateChangedToLow = false;
  __custom_block_logger__('AR Envelope gate became HIGH. Setting gateStateChangedToHigh.');
} else if (gateInputVal === false && internalState.prevGateState === true) {
  newInternalState.gateStateChangedToLow = true;
  newInternalState.gateStateChangedToHigh = false;
  __custom_block_logger__('AR Envelope gate became LOW. Setting gateStateChangedToLow.');
} else {
  newInternalState.gateStateChangedToHigh = false;
  newInternalState.gateStateChangedToLow = false;
}
newInternalState.prevGateState = gateInputVal;
return newInternalState;
        `.trim(),
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
        _initialParams: BlockParameter[] // initialParams might be used if envelope has initial settings not covered by ADSR values
    ): ManagedNativeNodeInfo {
        if (!this.context) throw new Error("AudioContext not initialized");
        const constSourceNode = this.context.createConstantSource();
        constSourceNode.offset.value = 0; // Envelopes typically start at 0
        constSourceNode.start(); // Start the source so it can be ramped

        // No direct AudioParam targets for CV for typical AD/AR envelopes via ConstantSourceNode offset automation.
        // CV inputs would typically go into the 'trigger_in' or 'gate_in' of the block's logic.
        const paramTargetsForCv = new Map<string, AudioParam>();

        return {
            node: constSourceNode, // The ConstantSourceNode is the output and what gets parameters automated
            nodeForInputConnections: constSourceNode, // Not typical for an envelope source, but for consistency
            nodeForOutputConnections: constSourceNode,
            mainProcessingNode: constSourceNode,
            paramTargetsForCv,
            definition,
            instanceId,
            constantSourceValueNode: constSourceNode, // Specific for NativeNodeManager to control
        };
    }

    updateNodeParams(
        _nodeInfo: ManagedNativeNodeInfo,
        _parameters: BlockParameter[],
        _currentInputs?: Record<string, any>,
        _currentBpm?: number
    ): void {
        // For AD/AR envelopes driven by ConstantSourceNode, parameter changes (like attackTime, decayTime)
        // don't directly set AudioParams here. Instead, the block's logicCode interprets these
        // parameters and then calls specific methods on AudioEngineService/NativeNodeManager
        // (e.g., triggerNativeNodeEnvelope) which then perform the AudioParam automations.
        // So, this updateNodeParams might be a no-op for pure envelope parameters.
        // If there were other continuous AudioParams (e.g. a 'depth' control on the envelope output), they'd be handled here.
        // console.log(`EnvelopeNativeBlock.updateNodeParams called for ${_nodeInfo.instanceId}, but typically no direct AudioParam automation here.`);
    }

    connect(_destination: AudioNode | AudioParam, _outputIndex?: number, _inputIndex?: number): void {
        console.warn(`EnvelopeNativeBlock.connect called directly on instance. This should be handled by AudioGraphConnectorService.`);
    }

    disconnect(_destination?: AudioNode | AudioParam | number, _output?: number, _input?: number): void {
        console.warn(`EnvelopeNativeBlock.disconnect called directly on instance. This should be handled by AudioGraphConnectorService or by the manager's removeManagedNativeNode.`);
    }
}
