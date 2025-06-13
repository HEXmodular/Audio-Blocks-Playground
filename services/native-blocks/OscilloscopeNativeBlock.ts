import { BlockDefinition, BlockParameter, ManagedNativeNodeInfo } from '@interfaces/common'; // Updated import
import { createParameterDefinitions } from '../../constants/constants'; // Adjust path as needed
import { CreatableNode } from './CreatableNode';

export class OscilloscopeNativeBlock implements CreatableNode {
    private context: AudioContext;
    private analyserNode: AnalyserNode | null = null;

    static getDefinition(): BlockDefinition {
      return {
        id: 'analyser-oscilloscope-v1',
        name: 'Oscilloscope (Analyser)',
        description: 'Visualizes an audio signal waveform using a native AnalyserNode. The UI is shown in the block detail panel.',
        runsAtAudioRate: true,
        inputs: [ { id: 'audio_in', name: 'Audio Input', type: 'audio', description: 'Signal to visualize.' } ],
        outputs: [],
        parameters: createParameterDefinitions([
          {
            id: 'fftSize',
            name: 'FFT Size',
            type: 'select',
            options: [
              { value: 32, label: '32' }, { value: 64, label: '64' }, { value: 128, label: '128' },
              { value: 256, label: '256' }, { value: 512, label: '512' }, { value: 1024, label: '1024' },
              { value: 2048, label: '2048' }, { value: 4096, label: '4096' }, { value: 8192, label: '8192' },
              { value: 16384, label: '16384' }, { value: 32768, label: '32768' }
            ],
            defaultValue: 2048,
            description: 'Size of the FFT window. This influences the detail in the time domain data for the oscilloscope.'
          }
        ]),
        logicCode: "",
      };
    }

    constructor(context: AudioContext) {
        this.context = context;
    }

    setAudioContext(context: AudioContext | null): void {
        this.context = context!;
        // If context changes, existing analyserNode becomes invalid if it was created with old context
        if (!context && this.analyserNode) {
            try { this.analyserNode.disconnect(); } catch(e) {/*ignore*/}
            this.analyserNode = null;
        } else if (context && this.analyserNode && this.analyserNode.context !== context) {
            // This case is tricky; ideally, nodes are recreated. For now, nullify.
            try { this.analyserNode.disconnect(); } catch(e) {/*ignore*/}
            this.analyserNode = null;
        }
    }

    createNode(
        instanceId: string,
        definition: BlockDefinition,
        initialParams: BlockParameter[]
    ): ManagedNativeNodeInfo {
        if (!this.context) throw new Error("AudioContext not initialized");
        this.analyserNode = this.context.createAnalyser();

        const fftSizeParam = initialParams.find(p => p.id === 'fftSize');
        this.analyserNode.fftSize = fftSizeParam ? Number(fftSizeParam.currentValue) : 2048;

        return {
            node: this.analyserNode, // The AnalyserNode itself
            nodeForInputConnections: this.analyserNode,
            nodeForOutputConnections: this.analyserNode, // Analyser can pass through audio
            mainProcessingNode: this.analyserNode,
            paramTargetsForCv: new Map<string, AudioParam>(), // No direct CV targets for AnalyserNode params
            definition,
            instanceId,
        };
    }

    updateNodeParams(
        nodeInfo: ManagedNativeNodeInfo,
        parameters: BlockParameter[]
    ): void {
        if (!this.context || !(nodeInfo.mainProcessingNode instanceof AnalyserNode)) return;
        const analyserNode = nodeInfo.mainProcessingNode;

        const fftSizeParam = parameters.find(p => p.id === 'fftSize');
        if (fftSizeParam) {
            analyserNode.fftSize = Number(fftSizeParam.currentValue);
        }
    }

    connect(_destination: AudioNode | AudioParam, _outputIndex?: number, _inputIndex?: number): void {
        console.warn(`OscilloscopeNativeBlock.connect called directly. Connections handled by AudioGraphConnectorService.`);
    }

    disconnect(_destination?: AudioNode | AudioParam | number, _output?: number, _input?: number): void {
        console.warn(`OscilloscopeNativeBlock.disconnect called directly. Connections handled by AudioGraphConnectorService/manager.`);
    }
}
