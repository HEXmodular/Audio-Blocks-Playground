import { BlockDefinition, BlockParameter } from '../../types';
import { ManagedNativeNodeInfo } from '../NativeNodeManager';
import { CreatableNode } from './CreatableNode';
import { NATIVE_AD_ENVELOPE_BLOCK_DEFINITION, NATIVE_AR_ENVELOPE_BLOCK_DEFINITION } from '../../constants';
// NATIVE_AD_ENVELOPE_BLOCK_DEFINITION and NATIVE_AR_ENVELOPE_BLOCK_DEFINITION
// are used for registration in NativeNodeManager, not directly in this file usually.

export class EnvelopeNativeBlock extends CreatableNode {
    constructor(audioContext: AudioContext | null) {
        super(audioContext);
    }

    createNode(
        instanceId: string,
        definition: BlockDefinition,
        initialParams: BlockParameter[]
        // currentBpm is not used by ConstantSourceNode for envelopes
    ): ManagedNativeNodeInfo {
        if (!this.audioContext) {
            throw new Error("AudioContext is not initialized for EnvelopeNativeBlock.");
        }

        const constSource = this.audioContext.createConstantSource();
        constSource.offset.value = 0; // Initial value for an envelope is typically 0
        constSource.start();

        // Envelopes (AD/AR) typically don't expose AudioParams like 'frequency' or 'gain' for direct CV control.
        // Their parameters (attack, decay, release, level) are used by the trigger methods.
        const paramTargets = new Map<string, AudioParam>();
        // We could potentially expose constSource.offset if direct CV control of the envelope's output level is desired,
        // but standard envelope usage implies triggers manipulate this. For now, keeping it simple.
        // paramTargets.set('offset', constSource.offset);


        return {
            nodeForInputConnections: constSource, // Envelopes are sources, typically don't have audio inputs. Control inputs are via parameters.
            nodeForOutputConnections: constSource, // Outputs the envelope signal.
            mainProcessingNode: constSource,
            paramTargetsForCv: paramTargets,
            definition: definition,
            instanceId: instanceId,
        };
    }

    updateNodeParams(
        info: ManagedNativeNodeInfo,
        parameters: BlockParameter[]
        // currentInputs and currentBpm are not used
    ): void {
        if (!this.audioContext || !info.mainProcessingNode || !(info.mainProcessingNode instanceof ConstantSourceNode)) {
            console.warn(`[EnvelopeNativeBlock Update] AudioContext not ready or node not a ConstantSourceNode for instance ${info.instanceId}.`);
            return;
        }

        // const constSourceNode = info.mainProcessingNode as ConstantSourceNode;

        // Parameters for AD/AR envelopes (like attackTime, decayTime, peakLevel, releaseTime, sustainLevel)
        // are typically not used to directly set AudioParam values on the ConstantSourceNode here.
        // Instead, these parameter values are read by NativeNodeManager's trigger methods
        // (triggerNativeNodeEnvelope, triggerNativeNodeAttackHold, triggerNativeNodeRelease)
        // which then schedule changes on the ConstantSourceNode's offset.

        // If there were any parameters of the envelope block itself that needed to be updated on the node directly,
        // this is where it would happen. For example, if 'peakLevel' was meant to be a direct scaling factor
        // settable at any time (though that's not typical for AD/AR).

        // For now, this method might be empty or handle very generic cases if any.
        parameters.forEach(param => {
            const targetAudioParam = info.paramTargetsForCv?.get(param.id);
            if (targetAudioParam) {
                if (typeof param.currentValue === 'number') {
                    // If we decided to expose `offset` via paramTargetsForCv, this would handle it.
                    // targetAudioParam.setTargetAtTime(param.currentValue, this.audioContext!.currentTime, 0.01);
                }
            }
            // Example: if envelope had a 'mode' parameter that changed behavior not related to triggers.
            // if (param.id === 'some_envelope_property' && typeof param.currentValue === 'string') {
            //    // ... update some internal state or node property if applicable
            // }
        });
    }

    // connect and disconnect are inherited
    // connect(destination: AudioNode): void { /* ... */ }
    // disconnect(destination: AudioNode): void { /* ... */ }
}
