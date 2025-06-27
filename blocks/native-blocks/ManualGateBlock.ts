import { BlockDefinition, BlockParameter, EmitterProvider, BlockInstance, NativeBlock } from '@interfaces/block'; // Added EmitterProvider
import { createParameterDefinitions } from '@constants/constants';
import * as Tone from 'tone'; // Added Tone

const BLOCK_DEFINITION: BlockDefinition = {
  id: 'native-manual-gate-v1', // Changed ID to reflect native implementation
  name: 'Manual Gate (Native)', // Changed name to reflect native implementation
  description: 'Provides a manual gate signal via a toggle UI parameter, using a native ConstantSourceNode.',
  inputs: [],
  outputs: [
    { id: 'gate_out', name: 'Gate Output', type: 'gate', description: 'Boolean gate signal.' }
  ],
  parameters: createParameterDefinitions([
    { id: 'gate_active', name: 'Gate Active', type: 'toggle', defaultValue: false, description: 'Controls the state of the gate output.' }
  ]),
  compactRendererId: 'manual-gate',
};

interface ManualGateNodeOptions extends Tone.ToneAudioNodeOptions {
  // sampleRate?: number; // Kept for consistency, though fixed in worklet for formula
  initialParams?: BlockParameter[];//  BlockParameter[]; // для загрузки сохраненных параметров из localstorage или файла
  // definition?: BlockDefinition; // для хранения дополнительной информации, которая вне Tone.ToneAudioNode
}

export class ManualGateBlock extends Tone.ToneAudioNode<ManualGateNodeOptions> implements NativeBlock { // Implemented EmitterProvider
  private _emitter: Tone.Emitter; // Added emitter property

  public static getDefinition(): BlockDefinition {
    return BLOCK_DEFINITION;
  }

  constructor(options?: ManualGateNodeOptions) {
    super(options);
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

  public updateFromBlockInstance(instance: BlockInstance): void {
    const parameters = instance.parameters || [];
    const gateActiveParam = parameters.find(p => p.id === 'gate_active');
    if (gateActiveParam) {
      const newGateValue = !!gateActiveParam.currentValue;
      const prevGateValue = false//instance.
      // internalState?.prevGateValue;
      this._emitter.emit('gate_change', { newState: newGateValue });


      // if (newGateValue !== prevGateValue && this._emitter) {
      //   this._emitter.emit('gate_change', { newState: newGateValue });
      //   // if (nodeInfo.internalState) {
      //   //   nodeInfo.internalState.prevGateValue = newGateValue;
      //   // }
      // }
    }
  }


}
