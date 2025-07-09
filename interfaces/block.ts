import * as Tone from 'tone';

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
    type: 'slider' | 'knob' | 'toggle' | 'select' | 'number_input' | 'text_input' | 'step_sequencer_ui' | 'text_inputs';
    options?: Array<{ value: string | number; label: string }>; // сейчас используется для передачи значений для select
    storage?: any;
    // min?: number; 
    // max?: number; 
    currentValue?: any; // а это если какое-то значение уже было сохранено
    defaultValue?: any; // чтобы были данные если загружается в первый раз
    description?: string;
    toneParam?: Partial<Tone.Param>; // для хранения значений типа минимума максимума
    emitters?: { [inputId: string]: Tone.Emitter };
    step?: number; // минимальный шаг изменения значения для контрола
    // steps?: number; 
    // isFrequency?: boolean;
}

// export type BlockParameter = BlockParameterBase;

export interface BlockPort {
    id: string;
    name: string;
    type: 'number' | 'string' | 'boolean' | 'audio' | 'trigger' | 'any' | 'gate';
    description?: string;
    // audioParamTarget?: string;  // выяснить
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
    category: 'data' | 'audio' | 'control' | 'logic' | 'ai' | 'i/o' | 'filter' | 'oscillator' | '8-bit' | 'pitch' | 'effects';
    inputs: BlockPort[];
    outputs: BlockPort[];
    parameters: BlockParameter[]; // для загрузки и сохранения описаний и значений параметров
    // для возвращения к жизни Gemini
    // logicCode?: string; // Made optional
    // initialPrompt?: string; // Already optional, but good to confirm
    // runsAtAudioRate?: boolean; 
    // audioWorkletProcessorName?: string; 
    // audioWorkletCode?: string; 
    // logicCodeTests?: string; 
    // isAiGenerated?: boolean;
    compactRendererId?: string;
}

export interface BlockInstance {
    instanceId: string;
    instance: Tone.ToneAudioNode & NativeBlock | null | undefined; // The actual audio node instance
    // definitionId: string; 
    definition: BlockDefinition;
    name: string;
    position: { x: number; y: number };
    logs: string[];
    parameters: BlockParameter[];
    emitters?: Tone.Emitter[];

    // lastRunOutputs: Record<string, any>; 
    // modificationPrompts: string[]; 
    // isRunning?: boolean; 
    error?: string | null;
    // audioWorkletNodeId?: string; 
}

//   export type ValueType = 'number' | 'string' | 'boolean' | 'audio' | 'trigger' | 'gate' | 'any' | 'object' | 'array';

export interface CompactRendererProps {
    blockInstance: BlockInstance;
    blockDefinition: BlockDefinition;
}

export interface NativeBlock {
    input?: Tone.ToneAudioNode;
    output?: Tone.ToneAudioNode | Tone.OutputNode;
    gateSubscriptions?: Tone.Emitter<string>[];
    emitter?: Tone.Emitter;
    // constructor: (options?: any) => void;
    updateFromBlockInstance: (instance: BlockInstance) => void;
    getEmitter?: (outputId: string) => Tone.Emitter | undefined
    setSubscription?: (subscription: { [inputId: string]: Tone.Emitter }) => void;
}