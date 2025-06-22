import { BlockDefinition, BlockParameter, ManagedNativeNodeInfo, EmitterProvider, BlockInstance } from '@interfaces/common'; // Added EmitterProvider
import { CreatableNode } from './CreatableNode';
import { createParameterDefinitions } from '@constants/constants';
import * as Tone from 'tone'; // Added Tone

export class ManualGateNativeBlock implements CreatableNode, EmitterProvider { // Implemented EmitterProvider
  private context: AudioContext | null;
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

  constructor(context: AudioContext | null) {
    this.context = context;
    this._emitter = new Tone.Emitter(); // Initialized emitter
  }

  public getEmitter(outputId: string): Tone.Emitter | undefined { // Implemented getEmitter
    if (outputId === 'gate_out' && this._emitter) {
      this._emitter.on('gate_change', (data) => {
        console.log("[ManualGateNativeBlock] Gate change event emitted:", data.newState); // Log gate changes
      })
      return this._emitter;
    }
    return undefined;
  }

  setAudioContext(context: AudioContext | null): void {
    this.context = context;
  }

  createNode(
    instanceId: string,
    definition: BlockDefinition,
    initialParams: BlockParameter[],
  ): ManagedNativeNodeInfo {
    if (!this.context) throw new Error("AudioContext not initialized for ManualGateNativeBlock");

    const constantSourceNode = this.context.createConstantSource();
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
      constantSourceValueNode: constantSourceNode, // Specific for nodes that are ConstantSourceNode-like
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
    if (!this.context) return;

    const constantSourceNode = nodeInfo.mainProcessingNode;
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
        console.log(`[ManualGateNativeBlock] Emitted gate_change: ${newGateValue} for instance ${nodeInfo.instanceId}`);
      }

      // Existing ConstantSourceNode update (kept as per instructions)
      if ((constantSourceNode as ConstantSourceNode).offset) {
        // Avoids clicks if possible, though for a gate, direct change is often fine.
        (constantSourceNode as ConstantSourceNode).offset.setTargetAtTime(newGateValue ? 1 : 0, this.context.currentTime, 0.01);
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
