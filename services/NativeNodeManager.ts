/**
 * This service is responsible for the lifecycle management of standard Web Audio API nodes (native nodes) used within the application's block-based audio graph.
 * It dynamically creates and configures various native nodes, such as oscillators, LFOs, filters, delays, gain nodes, and envelope generators, based on corresponding block definitions.
 * The manager handles setting initial parameters, updating them in real-time (including complex behaviors like BPM synchronization for LFOs or CV-to-AudioParam mapping), and provides specialized methods for triggering envelope behaviors.
 * It maintains a reference to all managed native nodes, including their specific input/output connection points and internal structures (like those for custom all-pass filters), ensuring they are correctly integrated into the audio graph.
 * Key functions also include the proper disconnection and removal of these nodes when blocks are deleted or the audio context changes.
 */
import {
    BlockDefinition,
    BlockParameter,
    ManagedNativeNodeInfo,
    AllpassInternalNodes,
    EnvelopeParams // Import EnvelopeParams
} from '@interfaces/common';
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
} from '@constants/constants';

import { GAIN_BLOCK_DEFINITION } from '@services/native-blocks/GainControlNativeBlock';

import { CreatableNode } from '@services/native-blocks/CreatableNode';
import { GainControlNativeBlock } from '@services/native-blocks/GainControlNativeBlock';
import { OscillatorNativeBlock } from '@services/native-blocks/OscillatorNativeBlock';
import { BiquadFilterNativeBlock } from '@services/native-blocks/BiquadFilterNativeBlock';
import { DelayNativeBlock } from '@services/native-blocks/DelayNativeBlock';
import { OscilloscopeNativeBlock } from '@services/native-blocks/OscilloscopeNativeBlock';
import { EnvelopeNativeBlock } from '@services/native-blocks/EnvelopeNativeBlock';
import { AllpassFilterNativeBlock } from '@services/native-blocks/AllpassFilterNativeBlock';
import { NumberToConstantAudioNativeBlock } from '@services/native-blocks/NumberToConstantAudioNativeBlock';


export interface INativeNodeManager {
    setupManagedNativeNode: (instanceId: string, definition: BlockDefinition, initialParams: BlockParameter[], currentBpm?: number) => Promise<boolean>;
    updateManagedNativeNodeParams: (instanceId: string, parameters: BlockParameter[], currentInputs?: Record<string, any>, currentBpm?: number) => void;
    triggerNativeNodeEnvelope: (instanceId: string, attackTime: number, decayTime: number, peakLevel: number) => void;
    triggerNativeNodeAttackHold: (instanceId: string, attackTime: number, sustainLevel: number) => void;
    triggerNativeNodeRelease: (instanceId: string, releaseTime: number) => void;
    removeManagedNativeNode: (instanceId: string) => void;
    removeAllManagedNativeNodes: () => void;
    getAnalyserNodeForInstance: (instanceId: string) => AnalyserNode | null;

    // Added methods to match usage in AudioEngineService
    removeNode: (nodeId: string) => void;
    getNodeInfo: (nodeId: string) => ManagedNativeNodeInfo | undefined;
    getAllNodeInfo: () => ManagedNativeNodeInfo[];
    triggerEnvelope: (nodeId: string, params: EnvelopeParams, triggerTime?: number) => void;
}

export class NativeNodeManager implements INativeNodeManager {
    private managedNativeNodesRef: Map<string, ManagedNativeNodeInfo>;
    private blockHandlers: Map<string, CreatableNode>;
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
        if (this.audioContext) {
            this.initializeBlockHandlers(this.audioContext);
        }
    }

    private initializeBlockHandlers(context: AudioContext): void {
        this.blockHandlers.set(GAIN_BLOCK_DEFINITION.id, new GainControlNativeBlock(context));
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
    }

    public _setAudioContext(newContext: AudioContext | null): void {
        if (this.audioContext !== newContext) {
            if (this.managedNativeNodesRef.size > 0) {
                console.log("[NativeManager] AudioContext changed/nulled. Removing all existing managed native nodes.", true);
                this.removeAllManagedNativeNodes();
            }
            this.audioContext = newContext;
            if (this.audioContext) {
                if (this.blockHandlers.size === 0) {
                    this.initializeBlockHandlers(this.audioContext);
                } else {
                    for (const handler of this.blockHandlers.values()) {
                        handler.setAudioContext(this.audioContext);
                    }
                }
            } else {
                for (const handler of this.blockHandlers.values()) {
                    handler.setAudioContext(null);
                }
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
                this.updateManagedNativeNodeParams(instanceId, initialParams, undefined, currentBpm);
                console.log(`[NativeManager Setup] Native node for '${definition.name}' (ID: ${instanceId}) created via handler.`, true);
                this.onStateChangeForReRender();
                return true;
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
        constSourceNode.offset.setValueAtTime(constSourceNode.offset.value, now);
        constSourceNode.offset.linearRampToValueAtTime(sustainLevel, now + attackTime);
    }

    public triggerNativeNodeRelease(instanceId: string, releaseTime: number): void {
        if (!this.audioContext || this.audioContext.state !== 'running') return;
        const info = this.managedNativeNodesRef.get(instanceId);
        if (!info || !info.mainProcessingNode || !(info.mainProcessingNode instanceof ConstantSourceNode)) return;
        const constSourceNode = info.mainProcessingNode as ConstantSourceNode;
        const now = this.audioContext.currentTime;
        constSourceNode.offset.cancelScheduledValues(now);
        constSourceNode.offset.setValueAtTime(constSourceNode.offset.value, now);
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
            this.removeManagedNativeNode(instanceId);
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

    // Public methods to match AudioEngineService calls
    public removeNode(nodeId: string): void {
        this.removeManagedNativeNode(nodeId);
    }
    public getNodeInfo(nodeId: string): ManagedNativeNodeInfo | undefined {
        return this.managedNativeNodesRef.get(nodeId);
    }
    public getAllNodeInfo(): ManagedNativeNodeInfo[] {
        return Array.from(this.managedNativeNodesRef.values());
    }
    public triggerEnvelope(nodeId: string, params: EnvelopeParams, triggerTime?: number): void {
        // This is a generic envelope trigger. NativeNodeManager has specific AD and AR triggers.
        // We need to decide which one to call or add a more generic one.
        // For now, let's try to call AD envelope if decayTime is present, else log.
        // This is a simplification and might need specific block definition check.
        const info = this.managedNativeNodesRef.get(nodeId);
        if (info && info.definition) {
            if (info.definition.id === NATIVE_AD_ENVELOPE_BLOCK_DEFINITION.id && params.decayTime !== undefined && params.peakLevel !== undefined) {
                this.triggerNativeNodeEnvelope(nodeId, params.attackTime, params.decayTime, params.peakLevel);
            } else if (info.definition.id === NATIVE_AR_ENVELOPE_BLOCK_DEFINITION.id && params.releaseTime !== undefined && params.sustainLevel !== undefined) {
                // AR logic is more gate-driven, not a simple one-shot trigger with these params.
                // This mapping is imperfect. LogicExecutionService should call specific AD/AR methods.
                console.warn(`triggerEnvelope called for AR block '${nodeId}', but AR is gate-driven. Use specific attack/release methods if applicable.`);
                 // Attempting to map to an attack phase for simplicity for now if sustainLevel is available
                if (params.sustainLevel !== undefined) {
                     this.triggerNativeNodeAttackHold(nodeId, params.attackTime, params.sustainLevel);
                }
            } else {
                 console.warn(`triggerEnvelope called for '${nodeId}' with unhandled params or block type for generic trigger.`);
            }
        } else {
            console.warn(`triggerEnvelope called for unknown or non-native-envelope node '${nodeId}'.`);
        }
    }
}
