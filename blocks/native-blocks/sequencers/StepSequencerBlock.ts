import { BlockDefinition, BlockParameter, BlockInstance, NativeBlock } from '@interfaces/block';
import { createParameterDefinitions } from '@constants/constants';
import { Emitter, ToneAudioNode, } from 'tone';

const DEFAULT_STEPS = 8;
const DEFAULT_SEQUENCE = Array(DEFAULT_STEPS).fill(false);

const BLOCK_DEFINITION = {
    id: 'native-step-sequencer-v1',
    name: 'Step Sequencer',
    description: 'A native step sequencer with gate and trigger inputs/outputs.',
    inputs: [
        { id: 'enable', name: 'Gate In', type: 'gate', description: 'Enables/disables the sequencer.' },
        { id: 'next', name: 'Trigger In', type: 'trigger', description: 'Advances the sequencer to the next step.' },
    ],
    outputs: [
        { id: 'output', name: 'Gate Output', type: 'number', description: 'Outputs the gate state of the current step.' },
        { id: 'trigger_out', name: 'Trigger Output', type: 'trigger', description: 'Outputs a trigger signal on each step change.' },
        // The 'sequence' output was typed as 'string', which is unusual for a boolean array.
        // If it's meant to be an event-based output of the current sequence array,
        // it would need its own emitter. For now, assuming it's a parameter.
        // { id: 'sequence_out', name: 'Sequence Output', type: 'data', description: 'Outputs the current sequence array on change.' },
    ],
    parameters: createParameterDefinitions([
        {
            id: 'sequence',
            name: 'Sequence',
            type: 'step_sequencer_ui',
            defaultValue: [...DEFAULT_SEQUENCE],
            description: 'The sequence pattern.',
        },
        {
            id: 'steps',
            name: 'Number of Steps',
            type: 'number_input',
            toneParam: { minValue: 1, maxValue: 16 },
            step: 1,
            defaultValue: DEFAULT_STEPS,
            description: 'Number of steps in the sequence.',
        }
    ]),
    // rendererId: 'StepSequencerControl', // If a custom compact renderer is used
};

// Interface for the internal state managed by the block instance
interface StepSequencerInternalState {
    currentStep: number;
    isEnabled: boolean;
    sequence: boolean[];
    // Store the emitter for gate_in if it's managed by the AudioGraphService
    // and passed via BlockInstance.internalState.emitters
    // gateInEmitter?: Tone.Emitter<any>; // No longer needed here, managed by setInputEmitter
}

export class StepSequencerBlock extends ToneAudioNode implements NativeBlock {
    readonly name: string = StepSequencerBlock.getDefinition().name;
    readonly input: undefined; // No direct audio input nodes
    readonly output: undefined; // No direct audio output nodes

    // private _gateEmitter: Tone.Emitter<{ newState: boolean }>;
    // gate = new Tone.Param({
    //     value: 0,
    //     units: 'number',
    //     minValue: 0,
    //     maxValue: 1
    // });
    private _emitter = new Emitter();


    // Internal state, mirroring what might be in BlockInstance.internalState
    // but managed directly by this class instance for its operations.
    private _currentStep: number = 0;
    private _sequence: boolean[] = [...DEFAULT_SEQUENCE];
    private _isEnabled: boolean = true;
    private _instance: BlockInstance;

    // private gateInSubscription?: { off: () => void }; // To store the subscription and allow unsubscribing
    // private triggerInSubscription?: { off: () => void }; // For trigger_in input


    public static getDefinition(): BlockDefinition {
        return BLOCK_DEFINITION;
    }

    constructor() {
        super();

        // Initialize with default state. This will be updated by `updateFromBlockInstance`.
        this.updateLocalState({
            currentStep: 0,
            isEnabled: true,
            sequence: [...DEFAULT_SEQUENCE],
        });

        this._emitter.on('enable', (payload) => {
            console.log("[StepSequencerBlock] Enable gate input received.", payload);
            this.handleGateIn(payload);
        })

        this._emitter.on('next', (payload) => {
            console.log("[StepSequencerBlock] Next input received.", payload);
            if (payload === true) this.handleTriggerIn();
        })
    }

    // для входящих соединений
    public emit(event: any, ...args: any[]) {
        console.log("--->[StepSequencerBlock]")
        this._emitter.emit(event, args?.[0])
        return this;
    };

    // для выходящий соединений отправляю
    public on(event: any, callback: (...args: any[]) => void) {
        console.log("[StepSequencerBlock]--->")
        this._emitter.on(event, callback)
        return this
    };

    // public getEmitter(outputId: string): Tone.Emitter<any> | undefined {
    //     if (outputId === 'gate_out') {
    //         return this._gateEmitter;
    //     }
    //     if (outputId === 'trigger_out') {
    //         return this._triggerEmitter;
    //     }
    //     // If 'sequence_out' was an event-based output, it would be handled here.
    //     return undefined;
    // }

    public updateFromBlockInstance(instance: BlockInstance): void {
        // this._instanceId = instance.instanceId; // Keep track of the instanceId
        this._instance = instance;

        // Update parameters (sequence and number of steps)
        if (instance.parameters) {
            this.updateParameters(instance.parameters);
        }

        // Update internal state (currentStep, isEnabled) from BlockInstance.internalState
        // This state is managed by the AudioGraphService and reflects the persisted/shared state.
        const state = instance.internalState as StepSequencerInternalState | undefined;
        if (state) {
            this.updateLocalState(state);
        }

        // Input emitter subscriptions are now handled by `setInputEmitter`
    }

    private updateParameters(parameters: BlockParameter[]): void {
        const stepsParam = parameters.find(p => p.id === 'steps');
        if (stepsParam) {
            const newNumSteps = Number(stepsParam.currentValue);
            if (newNumSteps !== this._sequence.length) {
                const oldSequence = [...this._sequence];
                this._sequence = Array(newNumSteps).fill(false);
                for (let i = 0; i < Math.min(newNumSteps, oldSequence.length); i++) {
                    this._sequence[i] = oldSequence[i];
                }
                // Ensure currentStep is within new bounds
                if (this._currentStep >= newNumSteps) {
                    this._currentStep = 0;
                }
                // TODO: Consider if the 'sequence' parameter in BlockInstance
                // also needs to be updated here if its source of truth is the UI
                // and this change (from 'steps') should reflect back.
                // This depends on the application's state management flow.
            }
        }

        const sequenceParam = parameters.find(p => p.id === 'sequence');
        if (sequenceParam && Array.isArray(sequenceParam.currentValue)) {
            // Only update if the sequence actually changed to avoid unnecessary processing
            if (JSON.stringify(this._sequence) !== JSON.stringify(sequenceParam.currentValue)) {
                this._sequence = [...sequenceParam.currentValue as boolean[]];
                // Ensure currentStep is within new bounds if sequence length changed
                if (this._currentStep >= this._sequence.length) {
                    this._currentStep = 0;
                }
            }
        }
    }

    // ? // ?
    private updateLocalState(state: Partial<StepSequencerInternalState>): void {
        if (state.currentStep !== undefined && this._currentStep !== state.currentStep) {
            this._currentStep = state.currentStep;
        }
        if (state.isEnabled !== undefined && this._isEnabled !== state.isEnabled) {
            this._isEnabled = state.isEnabled;
            // if (!this._isEnabled) {
            //     this._gateEmitter.emit('gate_change', { newState: false });
            // } else {
            //     this._gateEmitter.emit('gate_change', { newState: this._sequence[this._currentStep] ?? false });
            // }
        }
        if (state.sequence && JSON.stringify(this._sequence) !== JSON.stringify(state.sequence)) {
            this._sequence = [...state.sequence];
            if (this._currentStep >= this._sequence.length) {
                this._currentStep = 0; // Reset if out of bounds
            }
        }
    }

    // public setInputEmitter(inputId: string, emitter: Tone.Emitter<any> | undefined): void {
    //     // console.log(`[StepSequencerBlock ${this._instanceId}] setInputEmitter called for inputId: ${inputId}`);
    //     if (inputId === 'gate_in') {
    //         if (this.gateInSubscription) {
    //             this.gateInSubscription.off();
    //             this.gateInSubscription = undefined;
    //         }
    //         if (emitter) {
    //             const handler = (payload: { newState: boolean } | boolean) => {
    //                 const isActive = typeof payload === 'boolean' ? payload : payload.newState;
    //                 this.handleGateIn(isActive);
    //             };
    //             // Assuming 'gate_change' is the standard event for gate signals
    //             emitter.on('gate_change', handler);
    //             // Listen to 'trigger' as well if gate_in can be a simple trigger
    //             emitter.on('trigger', handler);
    //             this.gateInSubscription = {
    //                 off: () => {
    //                     emitter.off('gate_change', handler);
    //                     emitter.off('trigger', handler);
    //                 }
    //             };
    //             // console.log(`[StepSequencerBlock ${this._instanceId}] Subscribed to gate_in emitter.`);
    //         } else {
    //             // console.log(`[StepSequencerBlock ${this._instanceId}] Cleared gate_in emitter subscription.`);
    //         }
    //     } else if (inputId === 'trigger_in') {
    //         if (this.triggerInSubscription) {
    //             this.triggerInSubscription.off();
    //             this.triggerInSubscription = undefined;
    //         }
    //         if (emitter) {
    //             const handler = () => { // Trigger typically carries no payload or a simple signal
    //                 this.handleTriggerIn();
    //             };
    //             emitter.on('trigger', handler); // Assuming 'trigger' is the standard event
    //             this.triggerInSubscription = { off: () => emitter.off('trigger', handler) };
    //             // console.log(`[StepSequencerBlock ${this._instanceId}] Subscribed to trigger_in emitter.`);
    //         } else {
    //             // console.log(`[StepSequencerBlock ${this._instanceId}] Cleared trigger_in emitter subscription.`);
    //         }
    //     } else {
    //         console.warn(`[StepSequencerBlock ${this._instanceId}] setInputEmitter called for unknown inputId: ${inputId}`);
    //     }
    // }

    // private subscribeToGateIn(emitter?: Tone.Emitter<any>): void {
    //     if (this.gateInSubscription) {
    //         this.gateInSubscription.off(); // Unsubscribe from previous emitter
    //         this.gateInSubscription = undefined;
    //     }
    //     if (emitter) {
    //         // Assuming the event payload is { newState: boolean }
    //         const handler = (payload: { newState: boolean } | boolean) => {
    //             // console.log(`[StepSequencerBlock ${this._instanceId}] Gate In event:`, payload);
    //             const isActive = typeof payload === 'boolean' ? payload : payload.newState;
    //             this.handleGateIn(isActive);
    //         };
    //         emitter.on('gate_change', handler); // Standard event name from ManualGate
    //         emitter.on('trigger', handler); // If it can also be triggered by a simple trigger
    //         this.gateInSubscription = { off: () => {
    //             emitter.off('gate_change', handler);
    //             emitter.off('trigger', handler);
    //         }};
    //     }
    // }

    // --- Event handling for inputs ---
    // These methods are now primarily called by the handlers set up in `setInputEmitter`.
    // or by the emitter handlers.

    public handleGateIn(isActive: boolean): void {
        // console.log(`[StepSequencerBlock ${this._instanceId}] handleGateIn: ${isActive}`);
        if (this._isEnabled === isActive) return;

        this._isEnabled = isActive;
        if (!this._isEnabled) {
            this._emitter.emit('gate_change', false);
        } else {
            // When re-enabled, output current step's gate state
            this._emitter.emit('gate_change', this._sequence[this._currentStep] ?? false);
        }
        // TODO: Persist this change to BlockInstance.internalState via a service call or event
    }

    // next step
    public handleTriggerIn(): void {
        // console.log(`[StepSequencerBlock ${this._instanceId}] handleTriggerIn. Enabled: ${this._isEnabled}`);
        if (!this._isEnabled || this._sequence.length === 0) {
            return;
        }

        this._currentStep = (this._currentStep + 1) % this._sequence.length;
        this._instance.parameters = this._instance.parameters.map(param => param.id === 'sequence' ? ({ ...param, storage: { currentStep: this._currentStep } }) : param)
        this._emitter.emit('trigger'); // Emit void for trigger
        // const currentStepGateState = this._sequence[this._currentStep] ?? false;
        // this._emitter.emit('gate_change', { newState: currentStepGateState });

        // console.log(`[StepSequencerBlock ${this._instanceId}] Advanced to step: ${this._currentStep}, Gate: ${currentStepGateState}`);
        // TODO: Persist _currentStep change to BlockInstance.internalState
    }

    // --- NativeBlock stubs ---
    // connect and disconnect are typically managed by Tone.js or the graph service for ToneAudioNodes
    // For pure event-based blocks, these might not be directly used for audio routing.

    public dispose(): void {
        super.dispose(); // Important for Tone.ToneAudioNode cleanup
        // if (this.gateInSubscription) {
        //     this.gateInSubscription.off();
        //     this.gateInSubscription = undefined;
        // }
        // if (this.triggerInSubscription) {
        //     this.triggerInSubscription.off();
        //     this.triggerInSubscription = undefined;
        // }
        // this._gateEmitter.dispose();
        // this._triggerEmitter.dispose();
        // console.log(`[StepSequencerBlock ${this._instanceId}] Disposed.`);
    }
}