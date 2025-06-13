/**
 * This service is responsible for the lifecycle management of standard Web Audio API nodes (native nodes) used within the application's block-based audio graph.
 * It dynamically creates and configures various native nodes, such as oscillators, LFOs, filters, delays, gain nodes, and envelope generators, based on corresponding block definitions.
 * The manager handles setting initial parameters, updating them in real-time (including complex behaviors like BPM synchronization for LFOs or CV-to-AudioParam mapping), and provides specialized methods for triggering envelope behaviors.
 * It maintains a reference to all managed native nodes, including their specific input/output connection points and internal structures (like those for custom all-pass filters), ensuring they are correctly integrated into the audio graph.
 * Key functions also include the proper disconnection and removal of these nodes when blocks are deleted or the audio context changes.
 */
import { BlockDefinition, BlockParameter } from '@interfaces/common';
import {
    NATIVE_OSCILLATOR_BLOCK_DEFINITION,
    NATIVE_LFO_BLOCK_DEFINITION,
    NATIVE_LFO_BPM_SYNC_BLOCK_DEFINITION,
    NATIVE_BIQUAD_FILTER_BLOCK_DEFINITION,
    NATIVE_DELAY_BLOCK_DEFINITION,
    OSCILLOSCOPE_BLOCK_DEFINITION,
    NATIVE_AD_ENVELOPE_BLOCK_DEFINITION,
    NATIVE_AR_ENVELOPE_BLOCK_DEFINITION,
    NATIVE_ALLPASS_FILTER_BLOCK_DEFINITION,
    NUMBER_TO_CONSTANT_AUDIO_BLOCK_DEFINITION,
} from '@constants/constants'; // From root constants.ts

import { GAIN_BLOCK_DEFINITION } from '@services/native-blocks/GainControlNativeBlock'; // Specifically from its own file
import { AudioOutputNativeBlock, AUDIO_OUTPUT_BLOCK_DEFINITION as NATIVE_AUDIO_OUTPUT_BLOCK_DEFINITION } from '@services/native-blocks/AudioOutputNativeBlock';

import { CreatableNode } from '@services/native-blocks/CreatableNode';
import { GainControlNativeBlock } from '@services/native-blocks/GainControlNativeBlock';
import { OscillatorNativeBlock } from '@services/native-blocks/OscillatorNativeBlock';
import { BiquadFilterNativeBlock } from '@services/native-blocks/BiquadFilterNativeBlock';
import { DelayNativeBlock } from '@services/native-blocks/DelayNativeBlock';
import { OscilloscopeNativeBlock } from '@services/native-blocks/OscilloscopeNativeBlock';
import { EnvelopeNativeBlock } from '@services/native-blocks/EnvelopeNativeBlock';
import { AllpassFilterNativeBlock } from '@services/native-blocks/AllpassFilterNativeBlock';
import { NumberToConstantAudioNativeBlock } from '@services/native-blocks/NumberToConstantAudioNativeBlock';


export interface AllpassInternalNodes {
    inputPassthroughNode: GainNode;
    inputGain1: GainNode;
    inputDelay: DelayNode;
    feedbackGain: GainNode;
    feedbackDelay: DelayNode;
    summingNode: GainNode;
}

export type ManagedNativeNodeInfo = {
    nodeForInputConnections: AudioNode;
    nodeForOutputConnections: AudioNode;
    mainProcessingNode?: AudioNode;
    internalGainNode?: GainNode;
    allpassInternalNodes?: AllpassInternalNodes;
    paramTargetsForCv?: Map<string, AudioParam>;
    definition: BlockDefinition;
    instanceId: string;
    constantSourceValueNode?: ConstantSourceNode;
};

export interface INativeNodeManager {
    setupManagedNativeNode: (instanceId: string, definition: BlockDefinition, initialParams: BlockParameter[], currentBpm?: number) => Promise<boolean>;
    updateManagedNativeNodeParams: (instanceId: string, parameters: BlockParameter[], currentInputs?: Record<string, any>, currentBpm?: number) => void;
    triggerNativeNodeEnvelope: (instanceId: string, attackTime: number, decayTime: number, peakLevel: number) => void;
    triggerNativeNodeAttackHold: (instanceId: string, attackTime: number, sustainLevel: number) => void;
    triggerNativeNodeRelease: (instanceId: string, releaseTime: number) => void;
    removeManagedNativeNode: (instanceId: string) => void;
    removeAllManagedNativeNodes: () => void;
    getAnalyserNodeForInstance: (instanceId: string) => AnalyserNode | null;
    // managedNativeNodesRef will be a private property, so it's not part of the public interface.
}

export class NativeNodeManager implements INativeNodeManager {
    private managedNativeNodesRef: Map<string, ManagedNativeNodeInfo>;
    // private gainControlNativeBlock: GainControlNativeBlock; // Removed as it's now part of blockHandlers
    private blockHandlers: Map<string, CreatableNode>;

    // Make audioContext mutable
    private audioContext: AudioContext | null;
    private readonly onStateChangeForReRender: () => void;

    constructor(
        audioContext: AudioContext | null,
        onStateChangeForReRender: () => void,
    ) {
        this.audioContext = audioContext;
        this.onStateChangeForReRender = onStateChangeForReRender;
        this.managedNativeNodesRef = new Map<string, ManagedNativeNodeInfo>();

        this.blockHandlers = new Map<string, CreatableNode>();
        // No longer need separate gainControlNativeBlock field initialization here
        // this.gainControlNativeBlock = new GainControlNativeBlock(this.audioContext);

        if (this.audioContext) { // Ensure context is available for handlers
            this.initializeBlockHandlers(this.audioContext);
        }
    }

    private initializeBlockHandlers(context: AudioContext): void {
        this.blockHandlers.set(GAIN_BLOCK_DEFINITION.id, new GainControlNativeBlock(context)); // Add GainControlNativeBlock
        this.blockHandlers.set(NATIVE_OSCILLATOR_BLOCK_DEFINITION.id, new OscillatorNativeBlock(context));
        this.blockHandlers.set(NATIVE_LFO_BLOCK_DEFINITION.id, new OscillatorNativeBlock(context));
        this.blockHandlers.set(NATIVE_LFO_BPM_SYNC_BLOCK_DEFINITION.id, new OscillatorNativeBlock(context));
        this.blockHandlers.set(NATIVE_BIQUAD_FILTER_BLOCK_DEFINITION.id, new BiquadFilterNativeBlock(context));
        this.blockHandlers.set(NATIVE_DELAY_BLOCK_DEFINITION.id, new DelayNativeBlock(context));
        this.blockHandlers.set(OSCILLOSCOPE_BLOCK_DEFINITION.id, new OscilloscopeNativeBlock(context));
        this.blockHandlers.set(NATIVE_AD_ENVELOPE_BLOCK_DEFINITION.id, new EnvelopeNativeBlock(context));
        this.blockHandlers.set(NATIVE_AR_ENVELOPE_BLOCK_DEFINITION.id, new EnvelopeNativeBlock(context));
        this.blockHandlers.set(NATIVE_ALLPASS_FILTER_BLOCK_DEFINITION.id, new AllpassFilterNativeBlock(context));
        this.blockHandlers.set(NUMBER_TO_CONSTANT_AUDIO_BLOCK_DEFINITION.id, new NumberToConstantAudioNativeBlock(context));
        this.blockHandlers.set(NATIVE_AUDIO_OUTPUT_BLOCK_DEFINITION.id, new AudioOutputNativeBlock(context));
    }

    /**
     * Allows AudioEngine to update the AudioContext for this manager.
     * @param newContext The new AudioContext, or null.
     */
    public _setAudioContext(newContext: AudioContext | null): void {
        if (this.audioContext !== newContext) {
            if (this.managedNativeNodesRef.size > 0) {
                console.log("[NativeManager] AudioContext changed/nulled. Removing all existing managed native nodes.", true);
                this.removeAllManagedNativeNodes(); // Clears the map and disconnects nodes
            }
            this.audioContext = newContext;

            // Update context for all handlers
            if (this.audioContext) {
                // Initialize handlers if context was previously null
                if (this.blockHandlers.size === 0) {
                    this.initializeBlockHandlers(this.audioContext);
                } else {
                    for (const handler of this.blockHandlers.values()) {
                        handler.setAudioContext(this.audioContext);
                    }
                }
                // No longer need separate gainControlNativeBlock.setAudioContext call
                // this.gainControlNativeBlock.setAudioContext(this.audioContext);

            } else {
                // Context is null, clear handlers or set their context to null
                for (const handler of this.blockHandlers.values()) {
                    handler.setAudioContext(null);
                }
                // No longer need separate gainControlNativeBlock.setAudioContext call
                // this.gainControlNativeBlock.setAudioContext(null);
            }
            this.onStateChangeForReRender();
        }
    }

    public async setupManagedNativeNode(
        instanceId: string,
        definition: BlockDefinition,
        initialParams: BlockParameter[],
        currentBpm: number = 120
    ): Promise<boolean> {
        if (!this.audioContext || this.audioContext.state !== 'running') {
            console.log(`[NativeManager Setup] Cannot setup '${definition.name}' (ID: ${instanceId}): Audio system not ready.`, false);
            return false;
        }
        if (this.managedNativeNodesRef.has(instanceId)) {
            console.log(`[NativeManager Setup] Native node for ID '${instanceId}' already exists. Skipping.`, true);
            return true;
        }

        try {
            const handler = this.blockHandlers.get(definition.id);

            if (handler) {
                const nodeInfo = handler.createNode(instanceId, definition, initialParams, currentBpm);
                this.managedNativeNodesRef.set(instanceId, nodeInfo);
                // Initial parameters are typically applied by the handler's createNode or an initial call to updateNodeParams within it.
                // However, we call updateManagedNativeNodeParams here to ensure consistency, especially if createNode doesn't apply all initial params.
                this.updateManagedNativeNodeParams(instanceId, initialParams, undefined, currentBpm);
                console.log(`[NativeManager Setup] Native node for '${definition.name}' (ID: ${instanceId}) created via handler.`, true);
                this.onStateChangeForReRender();
                return true;
            // Removed the specific 'else if (definition.id === GAIN_BLOCK_DEFINITION.id)' block
            } else {
                console.log(`[NativeManager Setup] No handler for definition ID '${definition.id}'. Not recognized.`, true);
                return false;
            }
        } catch (e) {
            const errorMsg = `Failed to construct native node for '${definition.name}' (ID: ${instanceId}): ${(e as Error).message}`;
            console.error(errorMsg, e);
            console.log(errorMsg, true);
            return false;
        }
    }

    public updateManagedNativeNodeParams(
        instanceId: string,
        parameters: BlockParameter[],
        currentInputs?: Record<string, any>,
        currentBpm: number = 120
    ): void {
        if (!this.audioContext || this.audioContext.state !== 'running') return;
        const info = this.managedNativeNodesRef.get(instanceId);
        if (!info) return;

        const handler = this.blockHandlers.get(info.definition.id);

        if (handler) {
            handler.updateNodeParams(info, parameters, currentInputs, currentBpm);
            return;
        }
        // Removed the specific fallback for GAIN_BLOCK_DEFINITION.id

        // If no handler was found, log an error or handle as appropriate.
        console.warn(`[NativeManager Update] No handler found for definition ID '${info.definition.id}'. Update failed.`);
    }

    public triggerNativeNodeEnvelope(instanceId: string, attackTime: number, decayTime: number, peakLevel: number): void {
        if (!this.audioContext || this.audioContext.state !== 'running') return;
        const info = this.managedNativeNodesRef.get(instanceId);
        if (!info || !info.mainProcessingNode || !(info.mainProcessingNode instanceof ConstantSourceNode)) return;
        const constSourceNode = info.mainProcessingNode as ConstantSourceNode;
        const now = this.audioContext.currentTime;
        constSourceNode.offset.cancelScheduledValues(now);
        constSourceNode.offset.setValueAtTime(0, now);
        constSourceNode.offset.linearRampToValueAtTime(peakLevel, now + attackTime);
        constSourceNode.offset.linearRampToValueAtTime(0, now + attackTime + decayTime);
    }

    public triggerNativeNodeAttackHold(instanceId: string, attackTime: number, sustainLevel: number): void {
        if (!this.audioContext || this.audioContext.state !== 'running') return;
        const info = this.managedNativeNodesRef.get(instanceId);
        if (!info || !info.mainProcessingNode || !(info.mainProcessingNode instanceof ConstantSourceNode)) return;
        const constSourceNode = info.mainProcessingNode as ConstantSourceNode;
        const now = this.audioContext.currentTime;
        constSourceNode.offset.cancelScheduledValues(now);
        constSourceNode.offset.setValueAtTime(constSourceNode.offset.value, now); // Use current value
        constSourceNode.offset.linearRampToValueAtTime(sustainLevel, now + attackTime);
    }

    public triggerNativeNodeRelease(instanceId: string, releaseTime: number): void {
        if (!this.audioContext || this.audioContext.state !== 'running') return;
        const info = this.managedNativeNodesRef.get(instanceId);
        if (!info || !info.mainProcessingNode || !(info.mainProcessingNode instanceof ConstantSourceNode)) return;
        const constSourceNode = info.mainProcessingNode as ConstantSourceNode;
        const now = this.audioContext.currentTime;
        constSourceNode.offset.cancelScheduledValues(now);
        constSourceNode.offset.setValueAtTime(constSourceNode.offset.value, now); // Use current value
        constSourceNode.offset.linearRampToValueAtTime(0, now + releaseTime);
    }

    public removeManagedNativeNode(instanceId: string): void {
        const info = this.managedNativeNodesRef.get(instanceId);
        if (info) {
            try {
                info.nodeForOutputConnections.disconnect();
                if (info.mainProcessingNode && info.mainProcessingNode !== info.nodeForOutputConnections && info.mainProcessingNode !== info.nodeForInputConnections) {
                    info.mainProcessingNode.disconnect();
                    if (info.mainProcessingNode instanceof OscillatorNode || info.mainProcessingNode instanceof ConstantSourceNode) {
                        try { (info.mainProcessingNode as OscillatorNode | ConstantSourceNode).stop(); } catch (e) { /* already stopped */ }
                    }
                }
                if (info.nodeForInputConnections !== info.nodeForOutputConnections && info.nodeForInputConnections !== info.mainProcessingNode) {
                    info.nodeForInputConnections.disconnect();
                }
                if (info.internalGainNode) info.internalGainNode.disconnect();
                if (info.allpassInternalNodes) Object.values(info.allpassInternalNodes).forEach(node => node.disconnect());
                if (info.constantSourceValueNode) {
                    info.constantSourceValueNode.disconnect();
                    try { info.constantSourceValueNode.stop(); } catch (e) { /* already stopped */ }
                }
            } catch (e) {
                console.log(`[NativeManager Remove] Error disconnecting native node for '${instanceId}': ${(e as Error).message}`, true);
            }
            this.managedNativeNodesRef.delete(instanceId);
            console.log(`[NativeManager Remove] Removed native node for instance '${instanceId}'.`, true);
            this.onStateChangeForReRender();
        }
    }

    public removeAllManagedNativeNodes(): void {
        this.managedNativeNodesRef.forEach((_, instanceId) => {
            this.removeManagedNativeNode(instanceId); // Call the class method
        });
        console.log("[NativeManager] All managed native nodes removed.", true);
    }

    public getAnalyserNodeForInstance(instanceId: string): AnalyserNode | null {
        const nativeInfo = this.managedNativeNodesRef.get(instanceId);
        if (nativeInfo && nativeInfo.definition.id === OSCILLOSCOPE_BLOCK_DEFINITION.id && nativeInfo.mainProcessingNode instanceof AnalyserNode) {
            return nativeInfo.mainProcessingNode;
        }
        return null;
    }

    public getManagedNodesMap(): Map<string, ManagedNativeNodeInfo> {
        return this.managedNativeNodesRef;
    }
}
