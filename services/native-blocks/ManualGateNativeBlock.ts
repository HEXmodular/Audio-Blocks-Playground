import { BlockDefinition, BlockParameter, ManagedNativeNodeInfo, EmitterProvider, BlockInstance } from '@interfaces/common'; // Added EmitterProvider
import { CreatableNode } from './CreatableNode';
import { createParameterDefinitions } from '@constants/constants';
import * as Tone from 'tone'; // Added Tone

export class ManualGateNativeBlock implements CreatableNode, EmitterProvider { // Implemented EmitterProvider
  private _emitter: Tone.Emitter; // Added emitter property

  public static getDefinition(): BlockDefinition {
    return {
      id: 'native-manual-gate-v1', // Changed ID to reflect native implementation
      name: 'Manual Gate (Native)', // Changed name to reflect native implementation
      description: 'Provides a manual gate signal via a toggle UI parameter, using a native ConstantSourceNode.',
      runsAtAudioRate: true, // Native blocks that output audio run at audio rate
      inputs: [],
      outputs: [
        { id: 'gate_out', name: 'Gate Output', type: 'gate', description: 'Boolean gate signal.' }
      ],
      parameters: createParameterDefinitions([
        { id: 'gate_active', name: 'Gate Active', type: 'toggle', defaultValue: false, description: 'Controls the state of the gate output.' }
      ]),
      compactRendererId: 'manual-gate',
    };
  }

  constructor() {
    this._emitter = new Tone.Emitter(); // Initialized emitter
  }

  public getEmitter(outputId: string): Tone.Emitter | undefined { // Implemented getEmitter
    if (outputId === 'gate_out' && this._emitter) {
      this._emitter.on('gate_change', (data) => {
      })
      return this._emitter;
    }
    return undefined;
  }


  createNode(
    instanceId: string,
    definition: BlockDefinition,
    initialParams: BlockParameter[],
  ): ManagedNativeNodeInfo {
    // if (!this.context) throw new Error("AudioContext not initialized for ManualGateNativeBlock");
    const context = Tone.getContext();
    if (context.state !== 'running') {
      console.warn('Tone.js context is not running. Envelope may not function correctly.');
    }

    // скореее всего лучше удалить вообще
    const constantSourceNode = context.createConstantSource();

    constantSourceNode.offset.value = 0; // Default to 0 (gate off)

    const gateActiveParam = initialParams.find(p => p.id === 'gate_active');
    if (gateActiveParam) {
      constantSourceNode.offset.value = (gateActiveParam.currentValue as boolean) ? 1 : 0;
    }

    constantSourceNode.start(); // ConstantSourceNode needs to be started

    return {
      node: constantSourceNode,
      nodeForInputConnections: null, // No direct audio input
      nodeForOutputConnections: constantSourceNode,
      mainProcessingNode: constantSourceNode,
      paramTargetsForCv: new Map<string, AudioParam>(), // No CV inputs for this simple gate
      definition,
      instanceId,
      // constantSourceValueNode: constantSourceNode, // Specific for nodes that are ConstantSourceNode-like
      // Added emitter, providerInstance, and internalState
      emitter: this._emitter,
      providerInstance: this,
      internalState: { prevGateValue: (initialParams.find(p => p.id === 'gate_active')?.currentValue as boolean) ?? false },
    };
  }

  updateNodeParams(
    nodeInfo: ManagedNativeNodeInfo,
    instance: BlockInstance,
  ): void {
    const parameters = instance.parameters || [];
    const gateActiveParam = parameters.find(p => p.id === 'gate_active');
    if (gateActiveParam) {
      
      const newGateValue = !!gateActiveParam.currentValue;
      const prevGateValue = nodeInfo.internalState?.prevGateValue;

      if (newGateValue !== prevGateValue && this._emitter) {
        this._emitter.emit('gate_change', { newState: newGateValue });
        if (nodeInfo.internalState) {
          nodeInfo.internalState.prevGateValue = newGateValue;
        }
      }

    }
  }

  connect(_destination: AudioNode | AudioParam, _outputIndex?: number, _inputIndex?: number): void {
    // Connections are handled by AudioGraphConnectorService
    console.warn(`ManualGateNativeBlock.connect called directly on instance. This should be handled by AudioGraphConnectorService.`);
  }

  disconnect(_destination?: AudioNode | AudioParam | number, _output?: number, _input?: number): void {
    // Disconnections are handled by AudioGraphConnectorService or NativeNodeManager
    console.warn(`ManualGateNativeBlock.disconnect called directly on instance. This should be handled by the manager's removeManagedNativeNode.`);
  }

  public dispose(nodeInfo: ManagedNativeNodeInfo): void {
    if (nodeInfo.emitter) {
      nodeInfo.emitter.dispose();
      console.log(`[ManualGateNativeBlock] Disposed emitter for instance ${nodeInfo.instanceId}`);
    }
    // If ConstantSourceNode is kept, it should also be stopped and disconnected here.
    if (nodeInfo.mainProcessingNode instanceof ConstantSourceNode) {
      nodeInfo.mainProcessingNode.stop();
      nodeInfo.mainProcessingNode.disconnect();
    }
  }
}
