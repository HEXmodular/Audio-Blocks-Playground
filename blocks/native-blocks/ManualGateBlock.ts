import { BlockDefinition, BlockInstance, NativeBlock } from '@interfaces/block'; // Added EmitterProvider
import { createParameterDefinitions } from '@constants/constants';
import { ToneAudioNode, Emitter } from 'tone';

const BLOCK_DEFINITION: BlockDefinition = {
  id: 'native-manual-gate-v1', // Changed ID to reflect native implementation
  name: 'Manual Gate', // Changed name to reflect native implementation
  description: 'Provides a manual gate signal via a toggle UI parameter.',
  category: 'logic',
  inputs: [],
  outputs: [
    { id: 'gate_out', name: 'Gate Output', type: 'gate', description: 'Boolean gate signal.' }
  ],
  parameters: createParameterDefinitions([
    { id: 'gate_active', name: 'Gate Active', type: 'toggle', defaultValue: false, description: 'Controls the state of the gate output.' }
  ]),
  compactRendererId: 'manual-gate',
};

export class ManualGateBlock extends ToneAudioNode implements NativeBlock { // Implemented EmitterProvider
  name = BLOCK_DEFINITION.name;
  input = undefined;
  output = undefined;
  // TODO подумать как реализовать отправку множества сигналов, в том числе отднотипных
  private _emitter = new Emitter();

  public static getDefinition(): BlockDefinition {
    return BLOCK_DEFINITION;
  }

  constructor() {
    super();
  }


  // для выходящий соединений отправляю
  public on(event: any, callback: (...args: any[]) => void) {
    console.log("[Manual Gate]|--->")
    this._emitter.on(event, callback)

    return this
  };

  // TODO: как только происходит обновление параметро в другомблоке этот стреляет каждый раз, что не правильно
  public updateFromBlockInstance(instance: BlockInstance): void {
    const parameters = instance.parameters || [];
    const gateActiveParam = parameters.find(p => p.id === 'gate_active');
    // console.log("gateActiveParam", gateActiveParam);
    if (typeof gateActiveParam?.currentValue !== 'undefined') {
      const newGateValue = !!gateActiveParam.currentValue;
      // const prevGateValue = false//instance.
      // console.log("emmited", newGateValue);
      // this._gate_active = newGateValue;
      this._emitter.emit("gate_out", newGateValue);
    }
  }


}
