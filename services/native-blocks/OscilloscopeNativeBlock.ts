import { BlockDefinition, BlockParameter, ManagedNativeNodeInfo } from '@interfaces/common'; // Updated import
import { CreatableNode } from './CreatableNode';

export class OscilloscopeNativeBlock implements CreatableNode {
    private context: AudioContext;
    private analyserNode: AnalyserNode | null = null;

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

    connect(destination: AudioNode | AudioParam, outputIndex?: number, inputIndex?: number): void {
        console.warn(`OscilloscopeNativeBlock.connect called directly. Connections handled by AudioGraphConnectorService.`);
    }

    disconnect(destination?: AudioNode | AudioParam | number, output?: number, input?: number): void {
        console.warn(`OscilloscopeNativeBlock.disconnect called directly. Connections handled by AudioGraphConnectorService/manager.`);
    }
}
