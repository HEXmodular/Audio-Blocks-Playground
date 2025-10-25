import { Emitter, OutputNode, Param, ToneAudioNode } from 'tone';

export enum BlockView {
    UI = 'UI',
    CODE = 'CODE',
    LOGS = 'LOGS',
    PROMPT = 'PROMPT',
    CONNECTIONS = 'CONNECTIONS',
    TESTS = 'TESTS',
}

export interface BlockParameter {
    id: string;
    name: string;
    type: 'slider' | 'knob' | 'toggle' | 'select' | 'number_input' | 'text_input' | 'step_sequencer_ui' | 'text_inputs' | 'button' | 'internal';
    options?: Array<{ value: string | number; label: string }>; // сейчас используется для передачи значений для select
    getOptionsAsync?: () => Promise<Array<{ value: string | number; label: string }>>;
    storage?: any;
    min?: number; // TODO: удалить
    max?: number; 
    currentValue?: any; // а это если какое-то значение уже было сохранено
    defaultValue?: any; // чтобы были данные если загружается в первый раз
    description?: string;
    toneParam?: Partial<Param>; // для хранения значений типа минимума максимума
    emitters?: { [inputId: string]: Emitter };  // TODO: зачем это?
    emitterId?: string;     // для блоков с не автоматизированными контролами, например кнопки копирования и вставки данных в TrackerBlock
    step?: number; // минимальный шаг изменения значения для контрола
    // steps?: number; 
    isFrequency?: boolean;
    label?: string;
}

// export type BlockParameter = BlockParameterBase;

export interface BlockPort {
    id: string;
    name: string;
    type: 'number' | 'string' | 'boolean' | 'audio' | 'trigger' | 'gate' | 'note'| 'part' | 'сс' | 'any';
    description?: string;
    audioParamTarget?: string;  // выяснить
}


// export type BlockParameterDefinition = BlockParameterBase;

// export interface BlockParameter extends BlockParameterBase {
//   currentValue: any;
// }

// используется в BlockStateManager для загрузки состояния
export interface BlockDefinition {
    id: string;
    name: string;
    description?: string;
    category: 'data' | 'audio' | 'control' | 'logic' | 'ai' | 'i/o' | 'filter' | 'oscillator' | '8-bit' | 'pitch' | 'effects' | 'container' | 'midi' | 'instrument';
    inputs: BlockPort[];
    outputs: BlockPort[];
    parameters: BlockParameter[]; // для загрузки и сохранения описаний и значений параметров
    // для возвращения к жизни Gemini
    logicCode?: string; // Made optional
    initialPrompt?: string; // Already optional, but good to confirm
    runsAtAudioRate?: boolean; 
    audioWorkletProcessorName?: string; 
    audioWorkletCode?: string; 
    logicCodeTests?: string; 
    isAiGenerated?: boolean;
    compactRendererId?: string;
}

export interface BlockInstance {
    instanceId: string;
    instance: ToneAudioNode & NativeBlock | null | undefined; // The actual audio node instance
    definitionId: string; 
    definition: BlockDefinition;
    name: string;
    position: { x: number; y: number };
    logs: string[];
    parameters: BlockParameter[];
    // emitters?: Tone.Emitter[];
    width?: number;
    height?: number;
    internalState?: any;
    lastRunOutputs?: Record<string, any>; 
    modificationPrompts?: string[]; 
    // isRunning?: boolean; 
    error?: string | null;
    // audioWorkletNodeId?: string; 
    children?: string[];
    parentId?: string;
    lastChanges?: Partial<BlockInstance>;
}

//   export type ValueType = 'number' | 'string' | 'boolean' | 'audio' | 'trigger' | 'gate' | 'any' | 'object' | 'array';

export interface CompactRendererProps {
    blockInstance: BlockInstance;
    blockDefinition: BlockDefinition;
}

export interface NativeBlock {
    input?: ToneAudioNode;
    output?: ToneAudioNode | OutputNode;
    // gateSubscriptions?: Emitter<string>[];
    // emitter?: Emitter;
    // constructor: (options?: any) => void;
    updateFromBlockInstance: (instance: BlockInstance) => void;
    // getEmitter?: (outputId: string) => Tone.Emitter | undefined
    // setSubscription?: (subscription: { [inputId: string]: Tone.Emitter }) => void;
    emit?: (event: any, ...args: any[]) => void;
}
export class WithEmitter {
    protected _emitter = new Emitter();

    // для входящих соединений
    public emit(event: any, ...args: any[]) {
        // console.log("--->|")
        this._emitter.emit(event, args?.[0])
        return this;
    };

    // для выходящий соединений отправляю
    public on(event: any, callback: (...args: any[]) => void) {
        // console.log("|--->")
        this._emitter.on(event, callback)
        return this
    };

}

// export interface ManagedNativeNodeInfo {
//     node: AudioNode | null;
//     nodeForInputConnections: AudioNode | null;
//     nodeForOutputConnections: AudioNode | null;
//     mainProcessingNode: AudioNode | null;
//     paramTargetsForCv: Map<string, AudioParam>;
//     definition: BlockDefinition;
//     instanceId: string;
//     allpassInternalNodes?: any; // Should be more specific if possible
// }

// export interface ManagedWorkletNodeInfo {
//     node: AudioWorkletNode | null;
//     inputGainNode: GainNode | null;
//     definition: BlockDefinition;
//     instanceId: string;
// }
