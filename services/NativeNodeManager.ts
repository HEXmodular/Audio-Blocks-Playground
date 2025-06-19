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
import { BlockStateManager } from '@state/BlockStateManager'; // Added import

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
    _setAudioContext(newContext: AudioContext | null): void; // Ensure this is present
    getManagedNodesMap(): Map<string, ManagedNativeNodeInfo>; // Ensure this is present
}

export class NativeNodeManager implements INativeNodeManager {
    private managedNativeNodesRef: Map<string, ManagedNativeNodeInfo>;
    private blockHandlers: Map<string, CreatableNode>;
    // audioContext is no longer directly passed or stored here in the same way,
    // as Tone.js manages its own context, accessible via Tone.getContext().
    // We might still need to react to global AudioContext state changes from AudioContextService.
    // private audioContext: AudioContext | null;
    private readonly onStateChangeForReRender: () => void;

    constructor(
        _audioContext: AudioContext | null, // Kept for signature compatibility, but will use Tone.getContext()
        onStateChangeForReRender: () => void,
    ) {
        // this.audioContext = audioContext; // Not storing it directly
        this.onStateChangeForReRender = onStateChangeForReRender;
        this.managedNativeNodesRef = new Map<string, ManagedNativeNodeInfo>();
        this.blockHandlers = new Map<string, CreatableNode>();
        // Initialize handlers without passing context, as they are now Tone.js based
        // and will use Tone.getContext() or be context-agnostic.
        this.initializeBlockHandlers();
    }

    private initializeBlockHandlers(): void {
        const rawCtx = this.getRawAudioContext();

        // Refactored (Tone.js based) blocks - no context in constructor
        this.blockHandlers.set(GainControlNativeBlock.getDefinition().id, new GainControlNativeBlock());
        this.blockHandlers.set(OscillatorNativeBlock.getOscillatorDefinition().id, new OscillatorNativeBlock());
        this.blockHandlers.set(OscillatorNativeBlock.getLfoDefinition().id, new OscillatorNativeBlock());
        this.blockHandlers.set(OscillatorNativeBlock.getLfoBpmSyncDefinition().id, new OscillatorNativeBlock());
        this.blockHandlers.set(BiquadFilterNativeBlock.getDefinition().id, new BiquadFilterNativeBlock());
        this.blockHandlers.set(DelayNativeBlock.getDefinition().id, new DelayNativeBlock());
        this.blockHandlers.set(EnvelopeNativeBlock.getDefinition().id, new EnvelopeNativeBlock());
        this.blockHandlers.set(AudioOutputNativeBlock.getDefinition().id, new AudioOutputNativeBlock());

        // Unrefactored (or partially refactored) blocks that might still need raw AudioContext
        if (rawCtx) {
            this.blockHandlers.set(OscilloscopeNativeBlock.getDefinition().id, new OscilloscopeNativeBlock(rawCtx));
            this.blockHandlers.set(AllpassFilterNativeBlock.getDefinition().id, new AllpassFilterNativeBlock(rawCtx));
            this.blockHandlers.set(NumberToConstantAudioNativeBlock.getDefinition().id, new NumberToConstantAudioNativeBlock(rawCtx));
            this.blockHandlers.set(ManualGateNativeBlock.getDefinition().id, new ManualGateNativeBlock(rawCtx));
            // LyriaMasterBlock might have its own context management or needs specific setup
            this.blockHandlers.set(LyriaMasterBlock.getDefinition().id, new LyriaMasterBlock(rawCtx));
        } else {
            console.warn("[NativeNodeManager] AudioContext is null, unrefactored native block handlers not initialized.");
            // Note: Attempting to use these blocks later without a context will likely lead to errors.
        }
    }

    // This method needs to be re-evaluated. Tone.js manages its own context.
    // The primary concern is if the global Tone.context itself is reset or changes instance,
    // which is not typical during a session.
    // For now, we assume Tone.js context is stable once initialized by AudioContextService.
    public _setAudioContext(newContext: AudioContext | null): void {
        const oldContextIsToneContext = Tone.getContext() && Tone.getContext().rawContext === this.getRawAudioContext();

        if (this.getRawAudioContext() !== newContext) { // Check if the raw context is different
            if (this.managedNativeNodesRef.size > 0 && oldContextIsToneContext) {
                console.warn("[NativeManager] AudioContext changed/nulled. Removing all existing managed Tone.js based nodes.", true);
                this.removeAllManagedNativeNodes();
            }

            // If newContext is provided and different, it implies Tone.setContext(newContext) was called elsewhere.
            // Or, if newContext is null, it implies Tone.context might be unusable.
            // Block handlers generally don't need explicit context setting anymore.
            // Oscilloscope might be an exception if it still uses a raw AnalyserNode.
            if (newContext) {
                if (this.blockHandlers.size === 0) {
                    this.initializeBlockHandlers(); // Re-initialize if empty (e.g. first setup)
                }
                const oscilloscopeHandler = this.blockHandlers.get(OscilloscopeNativeBlock.getDefinition().id) as OscilloscopeNativeBlock | undefined;
                oscilloscopeHandler?.setAudioContext(newContext); // Oscilloscope might still need this
            } else {
                 const oscilloscopeHandler = this.blockHandlers.get(OscilloscopeNativeBlock.getDefinition().id) as OscilloscopeNativeBlock | undefined;
                oscilloscopeHandler?.setAudioContext(null);
            }

            this.onStateChangeForReRender();

            if (newContext && newContext.state === 'running') {
                console.log("[NativeManager] Audio context is now running. Checking for uninitialized Oscilloscope nodes.");
                // ... (rest of oscilloscope re-initialization logic - may need adjustment)
                // This logic for oscilloscope re-init is complex and might need a rethink
                // if OscilloscopeNativeBlock is also fully refactored for Tone.js (e.g. using Tone.Analyser).
                // For now, keeping it similar but acknowledging it's a special case.
                for (const [instanceId, nodeInfo] of this.managedNativeNodesRef.entries()) {
                    if (nodeInfo.definition.id === OscilloscopeNativeBlock.getDefinition().id && nodeInfo.mainProcessingNode === null) {
                        console.log(`[NativeManager] Attempting to re-initialize AnalyserNode for Oscilloscope instance '${instanceId}'.`);
                        const handler = this.blockHandlers.get(nodeInfo.definition.id) as OscilloscopeNativeBlock | undefined;
                        if (handler) {
                            handler.setAudioContext(newContext); // Ensure it has the new context
                            const paramsFromDefinition: BlockParameter[] = nodeInfo.definition.parameters.map(pDef => ({
                                id: pDef.id,
                                name: pDef.name,
                                type: pDef.type,
                                defaultValue: pDef.defaultValue,
                                currentValue: pDef.defaultValue,
                                options: pDef.options,
                                min: pDef.min,
                                max: pDef.max,
                                step: pDef.step,
                                description: pDef.description,
                                steps: pDef.steps,
                                isFrequency: pDef.isFrequency,
                            }));

                            const newNodeInfo = handler.createNode(instanceId, nodeInfo.definition, paramsFromDefinition);
                            if (newNodeInfo && (newNodeInfo.mainProcessingNode || newNodeInfo.toneAnalyser)) { // Check for Tone.Analyser if Oscilloscope is refactored
                                this.managedNativeNodesRef.set(instanceId, newNodeInfo);
                                console.log(`[NativeManager] Successfully re-initialized Oscilloscope instance '${instanceId}'.`);
                                this.onStateChangeForReRender();
                            } else {
                                console.warn(`[NativeManager] Failed to re-initialize Oscilloscope instance '${instanceId}' even though context is ready.`);
                            }
                        } else {
                            console.warn(`[NativeManager] Could not find handler for Oscilloscope instance '${instanceId}' during re-initialization.`);
                        }
                    }
                }
            }
        }
    }


    // Helper to get the raw AudioContext from Tone.js's context
    private getRawAudioContext(): AudioContext | null {
        const rawCtx = Tone?.getContext()?.rawContext;
        if (rawCtx) {
            return rawCtx as AudioContext;
        }
        return null;
    }

    public async setupManagedNativeNode(
        instanceId: string,
        definition: BlockDefinition,
        initialParams: BlockParameter[],
        currentBpm: number = 120
    ): Promise<boolean> {
        const toneContext = Tone.getContext();
        // Oscilloscope might be a special case if it still uses a raw AnalyserNode not managed by Tone.js context state in the same way.
        // For most Tone.js nodes, they are created fine, but won't process audio until Tone.start() is called.
        if (definition.id !== OscilloscopeNativeBlock.getDefinition().id) { // Assuming Oscilloscope might still need special context handling
            if (!toneContext || toneContext.state !== 'running') {
                console.warn(`[NativeManager Setup] Tone.js context not running. Node for '${definition.name}' (ID: ${instanceId}) will be created but may not process audio until context starts.`);
                // We allow creation, as Tone.js nodes can be instantiated before context is 'running'.
                // The actual audio processing will wait for Tone.start().
            }
        } else {
             if (!toneContext || toneContext.state !== 'running') {
                 console.warn(`[NativeManager Setup] Tone.js context not running for Oscilloscope '${definition.name}' (ID: ${instanceId}). AnalyserNode might not be available initially.`);
             }
        }

        if (this.managedNativeNodesRef.has(instanceId)) {
            console.warn(`[NativeManager Setup] Node for ID '${instanceId}' already exists. Skipping creation, but will ensure params are up-to-date.`);
            // Still update params in case they changed while the node "didn't exist" from manager's perspective
            this.updateManagedNativeNodeParams(instanceId, initialParams, undefined, currentBpm);
            return true;
        }
        try {
            const handler = this.blockHandlers.get(definition.id);
            if (handler) {
                // Ensure handler's internal context (if any, like for Oscilloscope) is up-to-date
                // For most Tone-based blocks, setAudioContext is a no-op or ensures Tone.getContext() is used.
                handler.setAudioContext(this.getRawAudioContext());

                const nodeInfo = handler.createNode(instanceId, definition, initialParams, currentBpm);
                this.managedNativeNodesRef.set(instanceId, nodeInfo);
                // updateManagedNativeNodeParams is often called inside createNode in the refactored blocks,
                // but calling it here ensures consistency if some blocks don't.
                this.updateManagedNativeNodeParams(instanceId, initialParams, undefined, currentBpm);
                console.log(`[NativeManager Setup] Tone.js based node for '${definition.name}' (ID: ${instanceId}) created/managed via handler.`);
                this.onStateChangeForReRender();
                return true;
            } else {
                console.warn(`[NativeManager Setup] No handler for definition ID '${definition.id}'. Not recognized.`, definition);
                return false;
            }
        } catch (e) {
            const errorMsg = `Failed to construct Tone.js based node for '${definition.name}' (ID: ${instanceId}): ${(e as Error).message}`;
            console.error(errorMsg, e);
            // console.log(errorMsg, true); // Avoid duplicate logging if error is rethrown by callee
            return false;
        }
    }

    public updateManagedNativeNodeParams(
        instanceId: string,
        parameters: BlockParameter[],
        currentInputs?: Record<string, any>,
        currentBpm: number = 120
    ): void {
        const toneContext = Tone.getContext();
        if (!toneContext || toneContext.state !== 'running') {
            // Allow param updates even if context is not 'running', as Tone.js nodes store these values.
            // console.warn(`[NativeManager Update] Tone.js context not 'running'. Parameter updates for '${instanceId}' will be applied but might not take effect immediately.`);
        }
        const info = this.managedNativeNodesRef.get(instanceId);
        if (!info) {
            // console.warn(`[NativeManager Update] No node info found for ID '${instanceId}'.`);
            return;
        }

        const blockInstance = BlockStateManager.getInstance().getBlockInstances().find(bi => bi.instanceId === instanceId);

        if (!blockInstance) {
            console.warn(`[NativeNodeManager Update] BlockInstance not found for ID '${instanceId}' during param update. Emitter propagation might be affected.`);
            // Continue without blockInstance for basic param updates, but emitter logic relies on it.
        }

        // Ensure info.internalState exists
        if (!info.internalState) {
            info.internalState = {};
        }

        // Propagate emitters from BlockInstance to ManagedNativeNodeInfo's internalState
        if (blockInstance && blockInstance.internalState?.emitters) {
            info.internalState.emitters = blockInstance.internalState.emitters;
            // console.log(`[NativeNodeManager] Propagated emitters for ${instanceId} to nodeInfo:`, info.internalState.emitters);
        } else if (info.internalState.emitters) {
            // If BlockInstance no longer has emitters, clear them from nodeInfo's internalState as well.
            delete info.internalState.emitters;
            // console.log(`[NativeNodeManager] Cleared emitters for ${instanceId} from nodeInfo internalState.`);
        }

        const handler = this.blockHandlers.get(info.definition.id);
        if (handler) {
            // Ensure handler context is set, especially for blocks like Oscilloscope
            handler.setAudioContext(this.getRawAudioContext());
            handler.updateNodeParams(info, parameters, currentInputs, currentBpm);
        } else {
            console.warn(`[NativeManager Update] No handler found for definition ID '${info.definition.id}'. Update failed for '${instanceId}'.`);
        }
    }

    // Obsolete envelope trigger methods - remove them
    // public triggerNativeNodeEnvelope(...)
    // public triggerNativeNodeAttackHold(...)
    // public triggerNativeNodeRelease(...)

    public removeManagedNativeNode(instanceId: string): void {
        const nodeInfo = this.managedNativeNodesRef.get(instanceId);
        if (nodeInfo) {
            const handler = this.blockHandlers.get(nodeInfo.definition.id);
            if (handler && typeof (handler as any).dispose === 'function') {
                try {
                    (handler as any).dispose(nodeInfo); // Call dispose on the handler, passing nodeInfo
                    console.log(`[NativeManager Remove] Disposed node for instance '${instanceId}' via handler.`);
                } catch (e) {
                    console.error(`[NativeManager Remove] Error disposing node for '${instanceId}' via handler: ${(e as Error).message}`, e);
                }
            } else {
                // Fallback for nodes that might not have a handler or specific dispose on handler (should not happen for refactored blocks)
                console.warn(`[NativeManager Remove] No handler with dispose method found for '${instanceId}'. Manually attempting to dispose contained Tone.js nodes.`);
                // Attempt to dispose known Tone.js objects if they exist directly on nodeInfo
                const knownToneFields = ['toneOscillator', 'toneGain', 'toneFilter', 'toneFeedbackDelay', 'toneAmplitudeEnvelope', 'toneAnalyser'];
                for (const field of knownToneFields) {
                    if ((nodeInfo as any)[field] && typeof (nodeInfo as any)[field].dispose === 'function') {
                        try {
                            (nodeInfo as any)[field].dispose();
                            console.log(`[NativeManager Remove] Fallback: Disposed ${field} for instance '${instanceId}'.`);
                        } catch (e) {
                             console.error(`[NativeManager Remove] Fallback: Error disposing ${field} for '${instanceId}': ${(e as Error).message}`);
                        }
                    }
                }
                 // Also disconnect nodeForOutputConnections and nodeForInputConnections if they are Tone.js nodes
                if (nodeInfo.nodeForOutputConnections && typeof (nodeInfo.nodeForOutputConnections as any).disconnect === 'function') {
                    try { (nodeInfo.nodeForOutputConnections as any).disconnect(); } catch(e) {/*ignore*/}
                }
                if (nodeInfo.nodeForInputConnections && typeof (nodeInfo.nodeForInputConnections as any).disconnect === 'function') {
                   try { (nodeInfo.nodeForInputConnections as any).disconnect(); } catch(e) {/*ignore*/}
                }
            }
            this.managedNativeNodesRef.delete(instanceId);
            this.onStateChangeForReRender();
        } else {
            // console.warn(`[NativeManager Remove] No node info found for ID '${instanceId}'. Nothing to remove.`);
        }
    }


    public removeAllManagedNativeNodes(): void {
        // Create a list of instance IDs to remove to avoid issues with modifying the map while iterating
        const instanceIdsToRemove = Array.from(this.managedNativeNodesRef.keys());
        instanceIdsToRemove.forEach(instanceId => {
            this.removeManagedNativeNode(instanceId);
        });
        console.log("[NativeManager] All managed native (Tone.js based) nodes removed attempt completed.", true);
    }

    public getAnalyserNodeForInstance = (instanceId: string): AnalyserNode | null => {
        const nodeInfo = this.managedNativeNodesRef.get(instanceId);
        // This needs to be updated if OscilloscopeNativeBlock is refactored to use Tone.Analyser
        if (nodeInfo && nodeInfo.definition.id === OscilloscopeNativeBlock.getDefinition().id) {
            if (nodeInfo.mainProcessingNode instanceof AnalyserNode) { // Legacy check
                return nodeInfo.mainProcessingNode;
            }
            if ((nodeInfo as any).toneAnalyser && (nodeInfo as any).toneAnalyser instanceof Tone.Analyser) {
                // If Oscilloscope uses Tone.Analyser, this method might need to return Tone.Analyser or adapt.
                // For now, assuming it might still expose a raw AnalyserNode if that's how it's implemented.
                // Or, this method becomes less relevant if UI consumes Tone.Analyser directly.
                console.warn("[NativeManager] getAnalyserNodeForInstance: Oscilloscope seems to use Tone.Analyser. Returning null for raw AnalyserNode.");
                return null;
            }
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
}
