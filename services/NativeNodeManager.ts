/**
 * This service is responsible for the lifecycle management of standard Web Audio API nodes (native nodes) used within the application's block-based audio graph.
 * It dynamically creates and configures various native nodes, such as oscillators, LFOs, filters, delays, gain nodes, and envelope generators, based on corresponding block definitions.
 * The manager handles setting initial parameters, updating them in real-time (including complex behaviors like BPM synchronization for LFOs or CV-to-AudioParam mapping), and provides specialized methods for triggering envelope behaviors.
 * It maintains a reference to all managed native nodes, including their specific input/output connection points and internal structures (like those for custom all-pass filters), ensuring they are correctly integrated into the audio graph.
 * Key functions also include the proper disconnection and removal of these nodes when blocks are deleted or the audio context changes.
 */
import * as Tone from 'tone'; // Added Tone import
import {
    BlockDefinition,
    BlockParameter,
    ManagedNativeNodeInfo,
    // AllpassInternalNodes, // Removed unused import - implicitly used by ManagedNativeNodeInfo
} from '@interfaces/common';

// Removed direct imports of BlockDefinition constants

import { CreatableNode } from '@services/native-blocks/CreatableNode';
import { AudioOutputNativeBlock } from '@services/native-blocks/AudioOutputNativeBlock'; // Added import
import { GainControlNativeBlock } from '@services/native-blocks/GainControlNativeBlock';
import { OscillatorNativeBlock } from '@services/native-blocks/OscillatorNativeBlock';
import { BiquadFilterNativeBlock } from '@services/native-blocks/BiquadFilterNativeBlock';
import { DelayNativeBlock } from '@services/native-blocks/DelayNativeBlock';
import { OscilloscopeNativeBlock } from '@services/native-blocks/OscilloscopeNativeBlock';
import { EnvelopeNativeBlock } from '@services/native-blocks/EnvelopeNativeBlock';
import { AllpassFilterNativeBlock } from '@services/native-blocks/AllpassFilterNativeBlock';
import { NumberToConstantAudioNativeBlock } from '@services/native-blocks/NumberToConstantAudioNativeBlock';
import { LyriaMasterBlock } from './lyria-blocks/LyriaMaster';
import { ManualGateNativeBlock } from './native-blocks/ManualGateNativeBlock';


export interface INativeNodeManager {
    setupManagedNativeNode: (instanceId: string, definition: BlockDefinition, initialParams: BlockParameter[], currentBpm?: number) => Promise<boolean>;
    updateManagedNativeNodeParams: (instanceId: string, parameters: BlockParameter[], currentInputs?: Record<string, any>, currentBpm?: number) => void;
    removeManagedNativeNode: (instanceId: string) => void;
    removeAllManagedNativeNodes: () => void;
    getAnalyserNodeForInstance: (instanceId: string) => AnalyserNode | null;

    // Added methods to match usage in AudioEngineService
    removeNode: (nodeId: string) => void;
    getNodeInfo: (nodeId: string) => ManagedNativeNodeInfo | undefined;
    getAllNodeInfo: () => ManagedNativeNodeInfo[];
    // Methods called by AudioEngineService
    setAudioContext(newContext: AudioContext | null): void; // Ensure this is present
    getManagedNodesMap(): Map<string, ManagedNativeNodeInfo>; // Ensure this is present
}

class NativeNodeManager implements INativeNodeManager {
    private static instance: NativeNodeManager; // Singleton instance
    private managedNativeNodesRef: Map<string, ManagedNativeNodeInfo>;
    private blockHandlers: Map<string, CreatableNode>;
    private readonly onStateChangeForReRender: () => void;

    private constructor(onStateChangeForReRender?: () => void) {
        this.onStateChangeForReRender = onStateChangeForReRender || (() => {});
        this.managedNativeNodesRef = new Map<string, ManagedNativeNodeInfo>();
        this.blockHandlers = new Map<string, CreatableNode>();
        this.initializeBlockHandlers();
    }

    // Public method to get the singleton instance
    public static getInstance(onStateChangeForReRender?: () => void): NativeNodeManager {
        if (!NativeNodeManager.instance) {
            NativeNodeManager.instance = new NativeNodeManager(onStateChangeForReRender);
        }
        return NativeNodeManager.instance;
    }

    private initializeBlockHandlers(): void {
        const rawCtx = this.getRawAudioContext();

        this.blockHandlers.set(GainControlNativeBlock.getDefinition().id, new GainControlNativeBlock());
        this.blockHandlers.set(OscillatorNativeBlock.getOscillatorDefinition().id, new OscillatorNativeBlock());
        this.blockHandlers.set(OscillatorNativeBlock.getLfoDefinition().id, new OscillatorNativeBlock());
        this.blockHandlers.set(OscillatorNativeBlock.getLfoBpmSyncDefinition().id, new OscillatorNativeBlock());
        this.blockHandlers.set(BiquadFilterNativeBlock.getDefinition().id, new BiquadFilterNativeBlock());
        this.blockHandlers.set(DelayNativeBlock.getDefinition().id, new DelayNativeBlock());
        this.blockHandlers.set(EnvelopeNativeBlock.getDefinition().id, new EnvelopeNativeBlock());
        this.blockHandlers.set(AudioOutputNativeBlock.getDefinition().id, new AudioOutputNativeBlock());

        if (rawCtx) {
            this.blockHandlers.set(OscilloscopeNativeBlock.getDefinition().id, new OscilloscopeNativeBlock(rawCtx));
            this.blockHandlers.set(AllpassFilterNativeBlock.getDefinition().id, new AllpassFilterNativeBlock(rawCtx));
            this.blockHandlers.set(NumberToConstantAudioNativeBlock.getDefinition().id, new NumberToConstantAudioNativeBlock(rawCtx));
            this.blockHandlers.set(ManualGateNativeBlock.getDefinition().id, new ManualGateNativeBlock(rawCtx));
            this.blockHandlers.set(LyriaMasterBlock.getDefinition().id, new LyriaMasterBlock(rawCtx));
        } else {
            console.warn("[NativeNodeManager] AudioContext is null, unrefactored native block handlers not initialized.");
        }
    }

    private getRawAudioContext(): AudioContext | null {
        const rawCtx = Tone?.getContext()?.rawContext;
        return rawCtx || null;
    }

    public setAudioContext(newContext: AudioContext | null): void {
        // console.log(`[NativeNodeManager.setAudioContext] Called with newContext:`, newContext); // REMOVED
        const oldContextIsToneContext = Tone.getContext() && Tone.getContext().rawContext === this.getRawAudioContext();

        if (this.getRawAudioContext() !== newContext) {
            if (this.managedNativeNodesRef.size > 0 && oldContextIsToneContext) {
                // console.warn('[NativeNodeManager.setAudioContext] Conditions met to call removeAllManagedNativeNodes. Current map size:', this.managedNativeNodesRef.size); // REMOVED
                console.warn("[NativeManager] AudioContext changed/nulled. Removing all existing managed Tone.js based nodes."); // Kept original warn
                this.removeAllManagedNativeNodes();
            }

            if (newContext) {
                if (this.blockHandlers.size === 0) {
                    this.initializeBlockHandlers();
                }
                const oscilloscopeHandler = this.blockHandlers.get(OscilloscopeNativeBlock.getDefinition().id) as OscilloscopeNativeBlock | undefined;
                oscilloscopeHandler?.setAudioContext(newContext);
            } else {
                const oscilloscopeHandler = this.blockHandlers.get(OscilloscopeNativeBlock.getDefinition().id) as OscilloscopeNativeBlock | undefined;
                oscilloscopeHandler?.setAudioContext(null);
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
        console.log(`[NativeManager Setup] Setting up Tone.js based node for '${definition.name}' (ID: ${instanceId})`);
        const toneContext = Tone.getContext();
        if (definition.id !== OscilloscopeNativeBlock.getDefinition().id && (!toneContext || toneContext.state !== 'running')) {
            console.warn(`[NativeManager Setup] Tone.js context not running. Node for '${definition.name}' (ID: ${instanceId}) may not process audio until context starts.`);
        }

        const handler = this.blockHandlers.get(definition.id);
        if (!handler) {
            console.warn(`[NativeManager Setup] No handler for definition ID '${definition.id}'.`);
            return false;
        }

        if (this.managedNativeNodesRef.has(instanceId)) {
            const existingNodeInfo = this.managedNativeNodesRef.get(instanceId);
            if (existingNodeInfo?.handler?.dispose) {
                existingNodeInfo.handler.dispose(existingNodeInfo);
            }
            this.managedNativeNodesRef.delete(instanceId);
        }

        try {
            handler.setAudioContext(this.getRawAudioContext());
            const nodeInfo = handler.createNode(instanceId, definition, initialParams, currentBpm);
            // REMOVED conditional logging for system-audio-output-tone-v1
            // if (definition.id === 'system-audio-output-tone-v1') {
            //     console.log(`[NativeNodeManager.setupManagedNativeNode] Storing AudioOutput: ID ${instanceId}, nodeForInputConnections: ${nodeInfo.nodeForInputConnections?.constructor?.name}, nodeInfo:`, JSON.stringify(nodeInfo, (key, value) => typeof value === 'object' && value !== null && value.constructor && value.constructor.name !== 'Object' ? value.constructor.name : value, 2));
            // }
            this.managedNativeNodesRef.set(instanceId, nodeInfo);
            // REMOVED conditional logging for system-audio-output-tone-v1
            // if (definition.id === 'system-audio-output-tone-v1') {
            //     const storedNode = this.managedNativeNodesRef.get(instanceId);
            //     console.log(`[NativeNodeManager.setupManagedNativeNode] VERIFY Stored AudioOutput: ID ${instanceId}, retrieved nodeForInputConnections: ${storedNode?.nodeForInputConnections?.constructor?.name}`);
            // }

            // If the node is supposed to run at audio rate but doesn't have a main processing node,
            // it's likely because the audio context wasn't ready (e.g., for Oscilloscope).
            // In this case, consider the setup as not fully successful so it can be retried.
            if (definition.runsAtAudioRate && !nodeInfo.mainProcessingNode) {
                console.warn(`[NativeManager Setup] Node for '${definition.name}' (ID: ${instanceId}) created, but mainProcessingNode is null. Context might not be running. Returning false to allow retry.`);
                this.managedNativeNodesRef.set(instanceId, nodeInfo); // Store the 'degraded' node
                this.onStateChangeForReRender();
                return false; // Signal that setup is not fully complete
            }

            this.managedNativeNodesRef.set(instanceId, nodeInfo);
            this.onStateChangeForReRender();
            return true;
        } catch (e) {
            console.error(`Failed to construct Tone.js based node for '${definition.name}' (ID: ${instanceId}): ${(e as Error).message}`);
            return false;
        }
    }

    public updateManagedNativeNodeParams(
        instanceId: string,
        parameters: BlockParameter[],
        currentInputs?: Record<string, any>,
        currentBpm: number = 120
    ): void {
        const info = this.managedNativeNodesRef.get(instanceId);
        console.log(`[↔ NativeManager Update] Updating node params for '${info?.definition.name}' (ID: ${instanceId}) with parameters:`, parameters);
        if (!info) return;

        const handler = this.blockHandlers.get(info.definition.id);
        if (handler) {
            handler.setAudioContext(this.getRawAudioContext());
            handler.updateNodeParams(info, parameters, currentInputs, currentBpm);
        } else {
            console.warn(`[NativeManager Update] No handler found for definition ID '${info.definition.id}'.`);
        }
    }

    public removeManagedNativeNode(instanceId: string): void {
        const nodeInfo = this.managedNativeNodesRef.get(instanceId);
        if (nodeInfo) {
            const handler = this.blockHandlers.get(nodeInfo.definition.id);
            handler?.dispose(nodeInfo);
            this.managedNativeNodesRef.delete(instanceId);
            this.onStateChangeForReRender();
        }
    }

    public removeAllManagedNativeNodes(): void {
        // console.warn('[NativeNodeManager.removeAllManagedNativeNodes] CALLED!'); // REMOVED
        // console.trace('[NativeNodeManager.removeAllManagedNativeNodes] Stack trace:'); // REMOVED
        Array.from(this.managedNativeNodesRef.keys()).forEach(instanceId => this.removeManagedNativeNode(instanceId));
    }

    public getAnalyserNodeForInstance(instanceId: string): AnalyserNode | null {
        const nodeInfo = this.managedNativeNodesRef.get(instanceId);
        if (nodeInfo?.definition.id === OscilloscopeNativeBlock.getDefinition().id) {
            return nodeInfo.mainProcessingNode as AnalyserNode;
        }
        return null;
    }

    public getManagedNodesMap(): Map<string, ManagedNativeNodeInfo> {
        // console.log(`[NativeNodeManager.getManagedNodesMap] CALLED. Current map size: ${this.managedNativeNodesRef.size}. Keys:`, Array.from(this.managedNativeNodesRef.keys())); // REMOVED
        return this.managedNativeNodesRef;
    }

    public removeNode(nodeId: string): void {
        this.removeManagedNativeNode(nodeId);
    }

    public getNodeInfo(nodeId: string): ManagedNativeNodeInfo | undefined {
        return this.managedNativeNodesRef.get(nodeId);
    }

    public getAllNodeInfo(): ManagedNativeNodeInfo[] {
        return Array.from(this.managedNativeNodesRef.values());
    }
}

export default NativeNodeManager.getInstance(); //.bind(NativeNodeManager);