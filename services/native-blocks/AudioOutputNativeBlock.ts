import {
    BlockDefinition,
    BlockParameter,
    ManagedNativeNodeInfo
    // BlockParameterDefinition // Removed as unused
} from '@interfaces/common';
import { CreatableNode } from './CreatableNode';
import { createParameterDefinitions } from '@constants/constants';

// Removed SAMPLE_BUFFER_PROCESSOR_NAME and SAMPLE_BUFFER_WORKLET_CODE constants

export class AudioOutputNativeBlock implements CreatableNode {
    private context: AudioContext | null;
    private internalGainNode: GainNode | null = null;
    // Removed: private workletNode: AudioWorkletNode | null = null;

    public static getDefinition(): BlockDefinition {
      return {
        id: 'system-audio-output-v1', // Matches original ID
        name: 'Audio Output',
        description: 'Plays the incoming audio signal. Contains an internal GainNode for volume control that connects to the main audio output.', // Updated description
        runsAtAudioRate: true,
        inputs: [
            { id: 'audio_in', name: 'Audio Input', type: 'audio', description: 'Signal to play. Connects to the internal volume GainNode.' }
        ],
        outputs: [], // No audio outputs from this block
        parameters: createParameterDefinitions([
            { id: 'volume', name: 'Volume', type: 'slider', min: 0, max: 1, step: 0.01, defaultValue: 0.7, description: 'Output volume level (controls an internal GainNode AudioParam)' }
        ]),
        logicCode: "", // No main-thread logic code for this native block
        // Removed: audioWorkletProcessorName and audioWorkletCode
        isAiGenerated: false,
        initialPrompt: '',
      };
    }

    constructor(context: AudioContext | null) {
        this.context = context;
    }

    setAudioContext(context: AudioContext | null): void {
        // If context changes, nodes would need to be recreated or re-homed.
        // For simplicity, current implementation might require block re-creation.
        if (this.context !== context) {
            console.warn("AudioOutputNativeBlock: AudioContext changed. Existing nodes may be invalid.");
            this.context = context;
            // TODO: Handle disconnection/recreation of nodes if context changes mid-lifecycle
            this.internalGainNode = null;
            // Removed: this.workletNode = null;
        }
    }

    createNode(
        instanceId: string,
        definition: BlockDefinition,
        initialParams: BlockParameter[]
    ): ManagedNativeNodeInfo {
        if (!this.context) {
            throw new Error("AudioContext not initialized for AudioOutputNativeBlock");
        }

        // Create internal GainNode for volume control
        this.internalGainNode = this.context.createGain();
        const volumeParam = initialParams.find(p => p.id === 'volume');
        this.internalGainNode.gain.value = volumeParam ? Number(volumeParam.currentValue) : 0.7;

        // Removed AudioWorkletNode creation and connection (this.internalGainNode.connect(this.workletNode))

        // The internalGainNode itself will be connected to master gain by AudioEngineService

        return {
            node: this.internalGainNode,
            nodeForInputConnections: this.internalGainNode,
            nodeForOutputConnections: this.internalGainNode, // Now the GainNode is the output
            mainProcessingNode: this.internalGainNode,     // And also the main processing node
            paramTargetsForCv: new Map<string, AudioParam>(),
            definition,
            instanceId,
            internalGainNode: this.internalGainNode,
        };
    }

    updateNodeParams(
        nodeInfo: ManagedNativeNodeInfo, // nodeInfo.internalGainNode should be the one created in createNode
        parameters: BlockParameter[]
    ): void {
        if (!this.context || !nodeInfo.internalGainNode) { // Check internalGainNode from nodeInfo
            console.warn("AudioOutputNativeBlock: AudioContext or internal GainNode not available for update.");
            return;
        }

        const gainNode = nodeInfo.internalGainNode as GainNode;

        const volumeParam = parameters.find(p => p.id === 'volume');
        if (volumeParam && gainNode.gain) {
            gainNode.gain.setTargetAtTime(Number(volumeParam.currentValue), this.context.currentTime, 0.01);
        }
    }

    connect(_destination: AudioNode | AudioParam, _outputIndex?: number, _inputIndex?: number): void {
        console.warn(`AudioOutputNativeBlock.connect called directly on instance. This should be handled by AudioGraphConnectorService or AudioEngineService for master gain connection.`);
    }

    disconnect(_destination?: AudioNode | AudioParam | number, _output?: number, _input?: number): void {
        console.warn(`AudioOutputNativeBlock.disconnect called. The primary output node (internalGainNode) is typically disconnected by NativeNodeManager or AudioGraphConnectorService.`);
        // If direct disconnection of internalGainNode is ever needed here, it could be added.
        // For now, relying on external management of nodeForOutputConnections.
        // Make sure this.internalGainNode is checked for null if used.
        if (this.internalGainNode) {
            try {
                if (typeof _destination === 'number') {
                    this.internalGainNode.disconnect(_destination);
                } else if (_destination instanceof AudioNode) { // Check if _destination is an AudioNode
                    if (_output === undefined) {
                        this.internalGainNode.disconnect(_destination);
                    } else if (_input === undefined) {
                        this.internalGainNode.disconnect(_destination, _output);
                    } else {
                        this.internalGainNode.disconnect(_destination, _output, _input);
                    }
                } else if (_destination instanceof AudioParam) { // Check if _destination is an AudioParam
                     if (_output === undefined) {
                        this.internalGainNode.disconnect(_destination);
                    } else {
                        this.internalGainNode.disconnect(_destination, _output);
                    }
                } else if (!_destination) { // _destination is undefined
                    // This would be the generic disconnect call from NativeNodeManager for nodeForOutputConnections
                    this.internalGainNode.disconnect();
                } else {
                    // Should not happen based on types, but as a fallback:
                    console.warn("AudioOutputNativeBlock: disconnect called with unexpected destination type for internalGainNode", _destination);
                }
            } catch (e) {
                console.warn("Error during AudioOutputNativeBlock.disconnect on internalGainNode:", e);
            }
        }
    }
}
