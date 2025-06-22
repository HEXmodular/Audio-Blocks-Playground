import { BlockDefinition, BlockParameter, ManagedNativeNodeInfo, EmitterProvider, BlockInstance, InputTerminal, OutputTerminal } from '@interfaces/common';
import { NativeBlock } from '../NativeBlock'; // Assuming NativeBlock is the correct base
import { CreatableNode } from '../CreatableNode';
import { createParameterDefinitions } from '@constants/constants'; // Corrected import path
import * as Tone from 'tone';

// Forward declare StepSequencerControl if its actual import path is problematic
// or if we just need its name for the renderer ID.
// For now, we assume the string ID 'step-sequencer' will be used.

const DEFAULT_STEPS = 8;
const DEFAULT_SEQUENCE = Array(DEFAULT_STEPS).fill(false);

export class StepSequencerNativeBlock extends NativeBlock implements CreatableNode, EmitterProvider {
  private _gateEmitter: Tone.Emitter;
  private _triggerEmitter: Tone.Emitter;
  private _currentStep: number = 0;
  private _sequence: boolean[] = [...DEFAULT_SEQUENCE];
  private _isEnabled: boolean = true; // Sequencer is enabled by default

  public static getDefinition(): BlockDefinition {
    return {
      id: 'native-step-sequencer-v1',
      name: 'Step Sequencer (Native)',
      description: 'A native step sequencer with gate and trigger inputs/outputs.',
      runsAtAudioRate: false, // Primarily event-based
      inputs: [
        { id: 'gate_in', name: 'Gate In', type: 'gate', description: 'Enables/disables the sequencer.' },
        { id: 'trigger_in', name: 'Trigger In', type: 'trigger', description: 'Advances the sequencer to the next step.' },
      ],
      outputs: [
        { id: 'gate_out', name: 'Gate Output', type: 'gate', description: 'Outputs the gate state of the current step.' },
        { id: 'trigger_out', name: 'Trigger Output', type: 'trigger', description: 'Outputs a trigger signal on each step change.' },
      ],
      parameters: createParameterDefinitions([
        {
          id: 'sequence',
          name: 'Sequence',
          type: 'step_sequence', // This type would be handled by StepSequencerControl
          defaultValue: [...DEFAULT_SEQUENCE],
          steps: DEFAULT_STEPS, // For StepSequencerControl
          description: 'The sequence pattern.',
        },
        {
          id: 'steps',
          name: 'Number of Steps',
          type: 'number', // Or 'slider' if preferred
          min: 1,
          max: 16, // Max steps, can be adjusted
          defaultValue: DEFAULT_STEPS,
          description: 'Number of steps in the sequence.',
        }
      ]),
      rendererId: 'StepSequencerControl', // This should match the component name or an ID linked to it
    };
  }

  constructor(context: AudioContext | null) {
    super(context);
    this._gateEmitter = new Tone.Emitter();
    this._triggerEmitter = new Tone.Emitter();
    // Initialize sequence from a default or potentially passed-in config
  }

  public getEmitter(outputId: string): Tone.Emitter | undefined {
    if (outputId === 'gate_out') {
      return this._gateEmitter;
    }
    if (outputId === 'trigger_out') {
      return this._triggerEmitter;
    }
    return undefined;
  }

  // --- CreatableNode implementation ---

  setAudioContext(context: AudioContext | null): void {
    super.setAudioContext(context);
    // If any internal nodes depended on context, re-initialize them here
  }

  createNode(
    instanceId: string,
    definition: BlockDefinition,
    initialParams: BlockParameter[],
  ): ManagedNativeNodeInfo {
    // console.log(`[StepSequencerNativeBlock createNode] ${instanceId}`, initialParams);
    this.updateSequenceFromParams(initialParams);

    // No actual Web Audio nodes are created if it's purely event-based
    // However, the interface expects some node. We can return a dummy gain node
    // if the NativeBlock base or system requires an AudioNode.
    // For now, assuming null is acceptable if no audio processing.
    // Let's follow ManualGateNativeBlock and return a dummy ConstantSourceNode for output connections if needed,
    // but for now, gate/trigger are event based.

    return {
      node: null, // No main audio node for a purely event-based sequencer
      nodeForInputConnections: null,
      nodeForOutputConnections: null,
      mainProcessingNode: null,
      paramTargetsForCv: new Map<string, AudioParam>(),
      definition,
      instanceId,
      // Emitter setup for outputs
      outputEmitters: {
        'gate_out': this._gateEmitter,
        'trigger_out': this._triggerEmitter,
      },
      // Provider setup for inputs (this instance handles incoming events)
      eventProvider: this,
      internalState: {
        currentStep: this._currentStep,
        isEnabled: this._isEnabled,
        sequence: [...this._sequence]
      },
    };
  }

  updateNodeParams(
    nodeInfo: ManagedNativeNodeInfo,
    instance: BlockInstance,
  ): void {
    // console.log(`[StepSequencerNativeBlock updateNodeParams] ${nodeInfo.instanceId}`, instance.parameters);
    if (instance.parameters) {
      this.updateSequenceFromParams(instance.parameters, nodeInfo.internalState);

      const stepsParam = instance.parameters.find(p => p.id === 'steps');
      if (stepsParam && nodeInfo.internalState && nodeInfo.internalState.sequence) {
          const newNumSteps = Number(stepsParam.currentValue);
          const currentNumSteps = nodeInfo.internalState.sequence.length;
          if (newNumSteps !== currentNumSteps) {
              const newSequence = Array(newNumSteps).fill(false);
              // Preserve existing steps if shrinking or copy existing if expanding
              for (let i = 0; i < Math.min(newNumSteps, currentNumSteps); i++) {
                  newSequence[i] = nodeInfo.internalState.sequence[i];
              }
              nodeInfo.internalState.sequence = newSequence;
              this._sequence = [...newSequence]; // Update internal cache
              // Also update the 'sequence' parameter's effective value if it's not directly driven by UI
              const sequenceParam = instance.parameters.find(p => p.id === 'sequence');
              if(sequenceParam) {
                sequenceParam.currentValue = [...newSequence];
              }
          }
      }
    }
  }

  private updateSequenceFromParams(params: BlockParameter[], internalState?: any): void {
    const sequenceParam = params.find(p => p.id === 'sequence');
    if (sequenceParam && Array.isArray(sequenceParam.currentValue)) {
      this._sequence = [...sequenceParam.currentValue];
      if (internalState) {
        internalState.sequence = [...this._sequence];
      }
    }
    // Reset step if sequence length changed and current step is out of bounds
    if (this._currentStep >= this._sequence.length) {
      this._currentStep = 0;
      if (internalState) {
        internalState.currentStep = this._currentStep;
      }
    }
  }

  // --- Event handling for inputs ---

  public handleGateIn(isActive: boolean, internalState?: any): void {
    // console.log(`[StepSequencerNativeBlock handleGateIn] ${isActive}`);
    this._isEnabled = isActive;
    if (internalState) {
        internalState.isEnabled = this._isEnabled;
    }
    if (!this._isEnabled) {
      // Optionally reset gate out to false when disabled
      this._gateEmitter.emit('gate_change', { newState: false });
    } else {
      // When re-enabled, output current step's gate
      this._gateEmitter.emit('gate_change', { newState: this._sequence[this._currentStep] });
    }
  }

  public handleTriggerIn(internalState?: any): void {
    // console.log(`[StepSequencerNativeBlock handleTriggerIn] Enabled: ${this._isEnabled}`);
    if (!this._isEnabled || !this._sequence.length) {
      return;
    }

    this._currentStep = (this._currentStep + 1) % this._sequence.length;
    if (internalState) {
        internalState.currentStep = this._currentStep;
    }

    // Emit trigger for the new step
    this._triggerEmitter.emit('trigger');

    // Emit gate state for the new step
    const currentStepGateState = this._sequence[this._currentStep];
    this._gateEmitter.emit('gate_change', { newState: currentStepGateState });

    // console.log(`[StepSequencerNativeBlock advanced] Step: ${this._currentStep}, Gate: ${currentStepGateState}`);
  }


  // --- NativeBlock stubs (if not handled by base or if specific logic needed) ---
  connect(destination: AudioNode, outputIndex?: number, inputIndex?: number): void {
    // Gate/trigger outputs are via emitters, not direct audio connections for this block
    console.warn(`StepSequencerNativeBlock.connect called. Event-based outputs used.`);
  }

  disconnect(destination?: AudioNode, outputIndex?: number, inputIndex?: number): void {
    console.warn(`StepSequencerNativeBlock.disconnect called.`);
  }

  public dispose(nodeInfo: ManagedNativeNodeInfo): void {
    // console.log(`[StepSequencerNativeBlock dispose] ${nodeInfo.instanceId}`);
    if (this._gateEmitter) {
      this._gateEmitter.dispose();
    }
    if (this._triggerEmitter) {
      this._triggerEmitter.dispose();
    }
    // Any other cleanup
  }
}