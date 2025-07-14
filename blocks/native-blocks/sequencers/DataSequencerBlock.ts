import { BlockDefinition, BlockParameter, BlockInstance, NativeBlock } from '@interfaces/block';
import { createParameterDefinitions } from '@constants/constants';
import { Emitter, ToneAudioNode, Time, getTransport, getDraw } from 'tone';
import BlockStateManager from '@state/BlockStateManager';

const DEFAULT_STEPS = 4;
const DEFAULT_SEQUENCE = Array(DEFAULT_STEPS).fill("");

const BLOCK_DEFINITION: BlockDefinition = {
    id: 'native-data-sequencer-v1',
    name: 'Data Sequencer',
    category: 'data',
    description: 'A native data sequencer with gate and trigger inputs/outputs.',
    inputs: [
        { id: 'next', name: 'Next trigger In', type: 'trigger', description: 'Advances the sequencer to the next step.' },
        { id: 'reset', name: 'Reset trigger In', type: 'trigger', description: 'Resets the sequencer to the next step.' },
        { id: 'enable', name: 'Gate In', type: 'gate', description: 'Enables/disables the sequencer.' }, // сильно под вопросом
    ],
    outputs: [
        { id: 'output_string', name: 'Data Output string', type: 'string', description: 'Outputs the data of the current step.' },
        { id: 'output_number', name: 'Data Output number', type: 'number', description: 'Outputs the data of the current step.' },
        { id: 'next_out', name: 'Trigger Output', type: 'trigger', description: 'Outputs a trigger signal on each step change.' },
        // The 'sequence' output was typed as 'string', which is unusual for a boolean array.
        // If it's meant to be an event-based output of the current sequence array,
        // it would need its own emitter. For now, assuming it's a parameter.
        // { id: 'sequence_out', name: 'Sequence Output', type: 'data', description: 'Outputs the current sequence array on change.' },
    ],
    parameters: createParameterDefinitions([
        {
            id: 'data',
            name: 'Data',
            type: 'text_inputs',
            defaultValue: DEFAULT_SEQUENCE,
            description: 'The sequence data.',
        },
        {
            id: 'steps',
            name: 'Number of Steps',
            type: 'number_input',
            toneParam: { minValue: 1, maxValue: 16 },
            step: 1,
            defaultValue: DEFAULT_STEPS,
            description: 'Number of steps in the sequence.',
        },
        {
            id: 'loopPeriod',
            name: 'Loop Period',
            type: 'text_input',
            defaultValue: '8n',
            description: 'Period of the sequencer loop in Tone.js Time notation (e.g., "4n", "8t", "1m").',
        },
        {
            id: 'loop',
            name: 'Loop',
            type: 'toggle',
            defaultValue: false,
            description: 'Enable or disable looping of the sequencer.',
        },

    ]),
    compactRendererId: 'data-sequencer', // If a custom compact renderer is used
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

export class DataSequencerBlock extends ToneAudioNode implements NativeBlock {
    readonly name: string = DataSequencerBlock.getDefinition().name;
    readonly input: undefined; // No direct audio input nodes
    readonly output: undefined; // No direct audio output nodes
    private _emitter = new Emitter();


    // Internal state, mirroring what might be in BlockInstance.internalState
    // but managed directly by this class instance for its operations.
    private _currentStep: number = 0;
    private _sequence: boolean[] = [...DEFAULT_SEQUENCE];
    private _isEnabled: boolean = true;
    private _instance: BlockInstance;
    private _loop: boolean = false;
    private _loopPeriod: string = '8n';
    private _transportEventId?: number;

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

        this._emitter.on('reset', (payload) => {
            console.log("[StepSequencerBlock] Reset input received.", payload);
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

    public updateFromBlockInstance(instance: BlockInstance): void {
        // this._instanceId = instance.instanceId; // Keep track of the instanceId
        this._instance = instance;

        // Update parameters (sequence and number of steps)
        if (instance.parameters) {
            // console.log("[DataSequencerBlock] updateFromBlockInstance", instance.parameters);
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
        const loopParam = parameters.find(p => p.id === 'loop');
        if (loopParam) {
            this._loop = Boolean(loopParam.currentValue);
        }

        const transport = getTransport();

        const loopPeriodParam = parameters.find(p => p.id === 'loopPeriod');
        if (loopPeriodParam?.currentValue !== this._loopPeriod || this._transportEventId === undefined) {
            this._loopPeriod = String(loopPeriodParam?.currentValue);

            if (this._transportEventId !== undefined) {
                transport.clear(this._transportEventId);
                this._transportEventId = undefined;
            }

            if (this._loop) {
                try {
                    // Validate loopPeriod - Tone.Time will throw an error if invalid
                    Time(this._loopPeriod);
                    this._transportEventId = transport.scheduleRepeat(
                        (time) => {
                            // Ensure the transport is actually started to avoid issues with scheduleRepeat firing immediately
                            if (transport.state === "started") {
                                this.handleTriggerIn(time);
                            }
                        },
                        this._loopPeriod
                    );
                } catch (error) {
                    console.error(`[StepSequencerBlock] Invalid loopPeriod: ${this._loopPeriod}`, error);
                    // Optionally, provide feedback to the user or disable looping
                    this._loop = false; // Disable looping if period is invalid
                    if (this._instance) { // Update the instance parameter to reflect this change
                        const loopParamRef = this._instance.parameters.find(p => p.id === 'loop');
                        if (loopParamRef) loopParamRef.currentValue = false;
                    }
                }
            }
        }

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

        const sequenceParam = parameters.find(p => p.id === 'data');
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

    // --- Event handling for inputs ---
    // These methods are now primarily called by the handlers set up in `setInputEmitter`.
    // or by the emitter handlers.

    public handleGateIn(isActive: boolean): void {
        // console.log(`[StepSequencerBlock ${this._instance?.instanceId}] handleGateIn: ${isActive}`);
        if (this._isEnabled === isActive) return;

        this._isEnabled = isActive;
        // If looping is enabled, Transport state dictates step advancement,
        // but gate still controls output.
        if (!this._isEnabled) {
            this._emitter.emit('gate_change', false); // Output low if disabled
        } else {
            // When re-enabled (or if already enabled), output current step's gate state
            // This is important if the sequencer was disabled mid-sequence.
            this._emitter.emit('gate_change', this._sequence[this._currentStep] ?? false);
        }
        // TODO: Persist this change to BlockInstance.internalState via a service call or event
    }

    public handleResetIn(time?: number) {
        this.handleTriggerIn(time, true);
    }

    // next step
    public handleTriggerIn(time?: number, isReset?: boolean): void { // time parameter is from Transport callback
        // console.log(`[StepSequencerBlock ${this._instance?.instanceId}] handleTriggerIn. Enabled: ${this._isEnabled}, Loop: ${this._loop}, Transport: ${Transport.state}`);

        // If looping, only advance if Tone.Transport is started.
        // The `time` parameter indicates it's a transport-scheduled call.
        if (this._loop && time !== undefined && getTransport().state !== 'started') {
            return;
        }

        // If not looping, or if looping and transport is started, or if triggered externally (time === undefined)
        if (!this._isEnabled || this._sequence.length === 0) {
            return;
        }

        this._currentStep = (this._currentStep + 1) % this._sequence.length;
        if (this._instance) {
            this._instance.parameters = this._instance.parameters.map(param =>
                param.id === 'data' ? ({ ...param, storage: { ...param.storage, currentStep: isReset ? 0 : this._currentStep } }) : param
            );

            this._emitter.emit('next_out', true);
            this._emitter.emit('output_string', this._sequence[this._currentStep]); // Emit void for trigger
            this._emitter.emit('output_number', this._sequence[this._currentStep]); // Emit void for trigger

            // синхранизирует с моментом следующей отрисовки
            getDraw().schedule(() => {
                // BlockStateManager.updateBlockInstance(this._instance.instanceId, { parameters: this._instance.parameters }); // Use context function
            }, time || 0)

        }

    }

    // --- NativeBlock stubs ---
    // connect and disconnect are typically managed by Tone.js or the graph service for ToneAudioNodes
    // For pure event-based blocks, these might not be directly used for audio routing.

    public dispose(): void {
        super.dispose(); // Important for Tone.ToneAudioNode cleanup

        // Clear any transport event on dispose
        if (this._transportEventId !== undefined) {
            getTransport().clear(this._transportEventId);
            this._transportEventId = undefined;
        }

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