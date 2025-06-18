import * as Tone from 'tone';
import { BlockDefinition, BlockParameter, ManagedNativeNodeInfo as OriginalManagedNativeNodeInfo } from '@interfaces/common';
import { createParameterDefinitions } from '../../constants/constants';
import { CreatableNode } from './CreatableNode';

export interface ManagedEnvelopeNodeInfo extends OriginalManagedNativeNodeInfo {
  toneAmplitudeEnvelope?: Tone.AmplitudeEnvelope;
  // Internal state for gate logic
  prevGateState?: boolean;
}

export class EnvelopeNativeBlock implements CreatableNode {
    // Context is assumed to be managed globally

    static getDefinition(): BlockDefinition { // Unified ADSR Envelope Definition
      return {
        id: 'tone-adsr-envelope-v1',
        name: 'ADSR Envelope (Tone)',
        description: 'Attack-Decay-Sustain-Release envelope generator using Tone.AmplitudeEnvelope. Shapes an incoming audio signal or outputs a CV signal if no audio is input. Triggered by a gate signal.',
        runsAtAudioRate: true, // The envelope output is audio rate
        inputs: [
          { id: 'audio_in', name: 'Audio Input', type: 'audio', description: 'Signal to be enveloped. If not connected, outputs a CV signal (0-1).', isOptional: true },
          { id: 'gate_in', name: 'Gate', type: 'gate', description: 'Controls the envelope: attack/decay/sustain (gate high), release (gate low).' },
          // Optional CV inputs for ADSR parameters
          { id: 'attack_cv_in', name: 'Attack CV', type: 'audio', description: 'Modulates attack time.', audioParamTarget: 'attack', isOptional: true },
          { id: 'decay_cv_in', name: 'Decay CV', type: 'audio', description: 'Modulates decay time.', audioParamTarget: 'decay', isOptional: true },
          { id: 'sustain_cv_in', name: 'Sustain CV', type: 'audio', description: 'Modulates sustain level.', audioParamTarget: 'sustain', isOptional: true },
          { id: 'release_cv_in', name: 'Release CV', type: 'audio', description: 'Modulates release time.', audioParamTarget: 'release', isOptional: true },
        ],
        outputs: [
          { id: 'audio_out', name: 'Output', type: 'audio', description: 'Enveloped audio signal or CV signal.' }
        ],
        parameters: createParameterDefinitions([
          { id: 'attack', name: 'Attack Time (s)', type: 'slider', min: 0.001, max: 5, step: 0.001, defaultValue: 0.1, description: 'Envelope attack time in seconds.' },
          { id: 'decay', name: 'Decay Time (s)', type: 'slider', min: 0.001, max: 5, step: 0.001, defaultValue: 0.2, description: 'Envelope decay time in seconds.' },
          { id: 'sustain', name: 'Sustain Level', type: 'slider', min: 0, max: 1, step: 0.01, defaultValue: 0.7, description: 'Envelope sustain level (0 to 1).' },
          { id: 'release', name: 'Release Time (s)', type: 'slider', min: 0.001, max: 5, step: 0.001, defaultValue: 0.5, description: 'Envelope release time in seconds.' },
          // Example for attack curve, could add for decay/release too
          { id: 'attackCurve', name: 'Attack Curve', type: 'select',
            options: Tone.Envelope.Curve.map(c => ({value: c, label: c.charAt(0).toUpperCase() + c.slice(1)})),
            defaultValue: 'linear', description: 'Shape of the attack curve.'}
        ]),
        logicCode: "", // No custom logic code for this native block
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
    ): ManagedEnvelopeNodeInfo {
        if (Tone.getContext().state !== 'running') {
            console.warn('Tone.js context is not running. Envelope may not function correctly.');
        }

        const initialAttack = initialParams.find(p => p.id === 'attack')?.currentValue as Tone.Unit.Time ?? 0.1;
        const initialDecay = initialParams.find(p => p.id === 'decay')?.currentValue as Tone.Unit.Time ?? 0.2;
        const initialSustain = initialParams.find(p => p.id === 'sustain')?.currentValue as Tone.Unit.NormalRange ?? 0.7;
        const initialRelease = initialParams.find(p => p.id === 'release')?.currentValue as Tone.Unit.Time ?? 0.5;

        const toneAmplitudeEnvelope = new Tone.AmplitudeEnvelope({
            attack: initialAttack,
            decay: initialDecay,
            sustain: initialSustain,
            release: initialRelease,
        });

        const initialAttackCurve = initialParams.find(p => p.id === 'attackCurve')?.currentValue as Tone.EnvelopeCurve;
        if (initialAttackCurve) {
            toneAmplitudeEnvelope.attackCurve = initialAttackCurve;
        }
        // Similar for decayCurve, releaseCurve if added as params

        const paramTargetsForCv = new Map<string, Tone.Param | Tone.Signal<any>>();
        paramTargetsForCv.set('attack', toneAmplitudeEnvelope.attack);
        paramTargetsForCv.set('decay', toneAmplitudeEnvelope.decay);
        paramTargetsForCv.set('sustain', toneAmplitudeEnvelope.sustain);
        paramTargetsForCv.set('release', toneAmplitudeEnvelope.release);

        return {
            toneAmplitudeEnvelope,
            nodeForInputConnections: toneAmplitudeEnvelope, // Audio signal goes into the envelope itself
            nodeForOutputConnections: toneAmplitudeEnvelope, // Enveloped signal comes out
            paramTargetsForCv,
            definition,
            instanceId,
            prevGateState: false, // Initialize internal state for gate tracking
            node: undefined,
            mainProcessingNode: undefined,
        };
    }

    updateNodeParams(
        nodeInfo: ManagedEnvelopeNodeInfo,
        parameters: BlockParameter[],
        currentInputs?: Record<string, any>,
        _currentBpm?: number
        // internalState is now part of nodeInfo (as prevGateState)
    ): void { // Return type void as internal state is managed within nodeInfo
        if (!nodeInfo.toneAmplitudeEnvelope) {
            console.warn('Tone.AmplitudeEnvelope not found in nodeInfo for EnvelopeNativeBlock', nodeInfo);
            return;
        }
        const envelope = nodeInfo.toneAmplitudeEnvelope;
        const context = Tone.getContext();

        // Update envelope parameters (ADSR values, curves)
        parameters.forEach(param => {
            switch (param.id) {
                case 'attack':
                    envelope.attack = Number(param.currentValue) as Tone.Unit.Time; break;
                case 'decay':
                    envelope.decay = Number(param.currentValue) as Tone.Unit.Time; break;
                case 'sustain':
                    envelope.sustain = Number(param.currentValue) as Tone.Unit.NormalRange; break;
                case 'release':
                    envelope.release = Number(param.currentValue) as Tone.Unit.Time; break;
                case 'attackCurve':
                    envelope.attackCurve = param.currentValue as Tone.EnvelopeCurve; break;
                // Add decayCurve, releaseCurve if implemented
            }
        });

        // Handle gate input
        if (currentInputs && typeof currentInputs.gate_in !== 'undefined') {
            const gateInputVal = !!currentInputs.gate_in; // Ensure boolean
            const now = context.currentTime;

            if (gateInputVal === true && !nodeInfo.prevGateState) { // Gate rising edge
                envelope.triggerAttack(now);
            } else if (gateInputVal === false && nodeInfo.prevGateState) { // Gate falling edge
                envelope.triggerRelease(now);
            }
            nodeInfo.prevGateState = gateInputVal; // Update previous gate state
        }
    }

    dispose(nodeInfo: ManagedEnvelopeNodeInfo): void {
        if (nodeInfo.toneAmplitudeEnvelope) {
            nodeInfo.toneAmplitudeEnvelope.dispose();
            console.log(`Disposed Tone.AmplitudeEnvelope node for instanceId: ${nodeInfo.instanceId}`);
        }
    }

    connect(_destination: Tone.ToneAudioNode | AudioParam, _outputIndex?: number, _inputIndex?: number): void {
        console.warn(`EnvelopeNativeBlock.connect called. Connections typically managed by AudioGraphConnectorService.`);
    }

    disconnect(_destination?: Tone.ToneAudioNode | AudioParam | number, _output?: number, _input?: number): void {
        console.warn(`EnvelopeNativeBlock.disconnect called. Connections typically managed by AudioGraphConnectorService.`);
    }
}
