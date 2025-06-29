import * as Tone from 'tone';
import { BlockDefinition, BlockInstance, BlockParameter, ManagedNativeNodeInfo as OriginalManagedNativeNodeInfo } from '@interfaces/common';
// AudioParam is a global type
import { createParameterDefinitions } from '../../constants/constants';
import { CreatableNode } from './CreatableNode';

export interface ManagedEnvelopeNodeInfo extends OriginalManagedNativeNodeInfo {
  toneAmplitudeEnvelope?: Tone.AmplitudeEnvelope;
  prevGateState?: boolean; // Keep this for internal logic
  gateEmitter?: Tone.Emitter; // The emitter this block is currently subscribed to for its gate_in
//   gateSubscription?: { off: () => void }; // Stores the subscription object from emitter.on()
}

export class EnvelopeNativeBlock implements CreatableNode {
    static getDefinition(): BlockDefinition {
      const envelopeCurveNames: string[] = ["linear", "exponential", "sine", "cosine", "bounce", "ripple", "step"];
      return {
        id: 'tone-adsr-envelope-v1',
        name: 'ADSR Envelope (Tone)',
        description: 'Attack-Decay-Sustain-Release envelope generator using Tone.AmplitudeEnvelope. Shapes an incoming audio signal or outputs a CV signal if no audio is input. Triggered by a gate signal.',
        runsAtAudioRate: true,
        inputs: [
          { id: 'audio_in', name: 'Audio Input', type: 'audio', description: 'Signal to be enveloped. If not connected, outputs a CV signal (0-1).' },
          { id: 'gate_in', name: 'Gate', type: 'gate', description: 'Controls the envelope: attack/decay/sustain (gate high), release (gate low).' },
          { id: 'attack_cv_in', name: 'Attack CV', type: 'audio', description: 'Modulates attack time.', audioParamTarget: 'attack' },
          { id: 'decay_cv_in', name: 'Decay CV', type: 'audio', description: 'Modulates decay time.', audioParamTarget: 'decay' },
          { id: 'sustain_cv_in', name: 'Sustain CV', type: 'audio', description: 'Modulates sustain level.', audioParamTarget: 'sustain' },
          { id: 'release_cv_in', name: 'Release CV', type: 'audio', description: 'Modulates release time.', audioParamTarget: 'release' },
        ],
        outputs: [
          { id: 'audio_out', name: 'Output', type: 'audio', description: 'Enveloped audio signal or CV signal.' }
        ],
        parameters: createParameterDefinitions([
          { id: 'attack', name: 'Attack Time (s)', type: 'slider', min: 0.001, max: 5, step: 0.001, defaultValue: 0.1, description: 'Envelope attack time in seconds.' },
          { id: 'decay', name: 'Decay Time (s)', type: 'slider', min: 0.001, max: 5, step: 0.001, defaultValue: 0.2, description: 'Envelope decay time in seconds.' },
          { id: 'sustain', name: 'Sustain Level', type: 'slider', min: 0, max: 1, step: 0.01, defaultValue: 0.7, description: 'Envelope sustain level (0 to 1).' },
          { id: 'release', name: 'Release Time (s)', type: 'slider', min: 0.001, max: 5, step: 0.001, defaultValue: 0.5, description: 'Envelope release time in seconds.' },
          {
            id: 'attackCurve', name: 'Attack Curve', type: 'select',
            options: envelopeCurveNames.map(c => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) })),
            defaultValue: 'linear', description: 'Shape of the attack curve.'
          }
        ]),
      };
    }

    constructor() {}

    gateSubscription: Tone.Emitter<string> | undefined; // Subscription to the gate emitter for this instance

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

        const initialAttackCurveParam = initialParams.find(p => p.id === 'attackCurve');
        if (initialAttackCurveParam) {
            toneAmplitudeEnvelope.attackCurve = initialAttackCurveParam.currentValue as any;
        }

        const specificParamTargetsForCv = new Map<string, AudioParam | Tone.Param<any> | Tone.Signal<any>>([
            ['attack', toneAmplitudeEnvelope.attack as unknown as Tone.Param<any>],
            ['decay', toneAmplitudeEnvelope.decay as unknown as Tone.Param<any>],
            ['sustain', toneAmplitudeEnvelope.sustain],
            ['release', toneAmplitudeEnvelope.release as unknown as Tone.Param<any>]
        ]);

        const nodeInfo: ManagedEnvelopeNodeInfo = {
            definition,
            instanceId,
            toneAmplitudeEnvelope,
            node: toneAmplitudeEnvelope as unknown as Tone.ToneAudioNode,
            nodeForInputConnections: toneAmplitudeEnvelope as unknown as Tone.ToneAudioNode,
            nodeForOutputConnections: toneAmplitudeEnvelope as unknown as Tone.ToneAudioNode,
            mainProcessingNode: toneAmplitudeEnvelope as unknown as Tone.ToneAudioNode,
            paramTargetsForCv: specificParamTargetsForCv,
            internalGainNode: undefined,


            prevGateState: false,
            internalState: {},
            // Initialize new properties
            gateEmitter: undefined,
            // gateSubscription: undefined, // это зачем?
        };
        return nodeInfo;
    }

    updateNodeParams(
        nodeInfo: ManagedEnvelopeNodeInfo,
        blockInstance: BlockInstance,
    ): void {
        // слишком много вызовов, разобраться
        // console.log("[EnvelopeNativeBlock] updateNodeParams called for instanceId:", nodeInfo.instanceId);
        if (!nodeInfo.toneAmplitudeEnvelope) {
            console.warn('Tone.AmplitudeEnvelope not found in nodeInfo for EnvelopeNativeBlock', nodeInfo);
            return;
        }
        const envelope = nodeInfo.toneAmplitudeEnvelope;
        const parameters = blockInstance.parameters;

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
                    envelope.attackCurve = param.currentValue as any; break;
            }
        });

        // --- Emitter-based gate control ---

        const newDesignatedEmitter = blockInstance.internalState.emitters?.gate_in

            // Subscribe to the new emitter
            if (newDesignatedEmitter?.on) {
                this.gateSubscription = newDesignatedEmitter.on('gate_change', (payload: { newState: boolean }) => {
                    console.log(`[EnvelopeNativeBlock] Instance ${nodeInfo.instanceId} received gate_change event from emitter:`, payload);
                    if (!nodeInfo.toneAmplitudeEnvelope) return;
                    const now = Tone.getContext().currentTime;
                    const currentEnvelopeState = nodeInfo.prevGateState;

                    if (payload.newState === true && !currentEnvelopeState) {
                        nodeInfo.toneAmplitudeEnvelope.triggerAttack(now);
                    } else if (payload.newState === false && currentEnvelopeState) {
                        nodeInfo.toneAmplitudeEnvelope.triggerRelease(now);
                    }
                    nodeInfo.prevGateState = payload.newState;
                    console.log(`[EnvelopeNativeBlock] Instance ${nodeInfo.instanceId} received gate_change: ${payload.newState}`);
                });
            } else {
                // No new emitter, so clear the current one
                this.gateSubscription = undefined;
            }
        
        // --- End of Emitter-based gate control ---
        // The old logic based on currentInputs.gate_in has been removed.
    }

    dispose(nodeInfo: ManagedEnvelopeNodeInfo): void {
        if (this.gateSubscription) { // Unsubscribe on dispose
            this.gateSubscription.off('gate_change');
            this.gateSubscription = undefined;
        }
        if (nodeInfo.toneAmplitudeEnvelope) {
            nodeInfo.toneAmplitudeEnvelope.dispose();
            console.log(`Disposed Tone.AmplitudeEnvelope node for instanceId: ${nodeInfo.instanceId}`);
        }
    }

    connect(_destination: any, _outputIndex?: number, _inputIndex?: number): any {
        console.warn(`EnvelopeNativeBlock.connect called. Connections typically managed by AudioGraphConnectorService.`);
    }

    disconnect(_destination?: any, _output?: number, _input?: number): void {
        console.warn(`EnvelopeNativeBlock.disconnect called. Connections typically managed by AudioGraphConnectorService.`);
    }
}
