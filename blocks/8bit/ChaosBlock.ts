
import { Emitter, Signal } from 'tone';
import { BlockDefinition, BlockInstance, NativeBlock } from '@interfaces/block';
import { createParameterDefinitions } from '@constants/constants';
import { seedrandom } from './seedrandom';

const BLOCK_DEFINITION: BlockDefinition = {
  id: 'chaos-v1',
  name: 'Chaos Automata',
  description: 'Generates a 1D cellular automaton sequence.',
  category: '8-bit',
  inputs: [],
  outputs: [
    { id: 'output', name: 'Output', type: 'audio', description: 'The generated signal.' }
  ],
  parameters: createParameterDefinitions([
    {
      id: 'states', name: 'States', type: 'slider',
      toneParam: { minValue: 2, maxValue: 16 }, step: 1,
      defaultValue: 4, description: 'Number of states/colors.'
    },
    {
      id: 'neighbors', name: 'Neighbors', type: 'slider',
      toneParam: { minValue: 3, maxValue: 9 }, step: 2,
      defaultValue: 5, description: 'Number of neighbors.'
    },
    {
      id: 'lambda', name: 'Lambda', type: 'slider',
      toneParam: { minValue: 0, maxValue: 1 }, step: 0.01,
      defaultValue: 0.5, description: 'Lambda parameter.'
    },
    // {
    //   id: 'speed', name: 'Speed', type: 'slider',
    //   toneParam: { minValue: 1, maxValue: 60 }, step: 1,
    //   defaultValue: 10, description: 'Generations per second.'
    // },
    {
      id: 'isIsotropic', name: 'Isotropic', type: 'toggle',
      defaultValue: false,
      description: 'Isotropic (symmetric) rule.'
    },
    {
      id: 'seed', name: 'Seed', type: 'number_input',
      defaultValue: 0,
      description: 'Seed for the rule.'
    },
  ]),
  compactRendererId: 'chaos-v1'
};

export class ChaosBlock implements NativeBlock {
  readonly name: string = BLOCK_DEFINITION.name;
  private _emitter = new Emitter();
  private intervalId: any;
  output = new Signal(0); // This is a native AudioWorkletNode, managed by this ToneAudioNode
  private shiftIndex = 0;
  // private speed = 1;
  // private locked = false;

  // Automata state
  private states = 2//4;
  private neighbors = 5;
  private isIsotropic = false //true;
  private worldSize = 64 + 1; //101;
  private rule: Uint8Array | number[] = [];
  private lambdaPath: Uint32Array | number[] = [];
  private rulesUsed = 0;
  private ruleIsUsed: Uint8Array | number[] = [];
  private generationNumber = 0;
  private currentWorld: Uint8Array | number[] = [];
  private random: () => number;

  constructor() {
    // Initialize with default random function
    console.log("seedrandom", seedrandom);
    // this.random = Math.random;
    this.random = () => {
      // Создаем массив для одного 32-битного беззнакового целого числа
      const randomBuffer = new Uint32Array(1);
      // randomBuffer[0] = Math.random();
      // Заполняем массив случайным значением из системного пула энтропии
      crypto.getRandomValues(randomBuffer);
      // const randomNumber = randomBuffer[0]*Math.random();
      return randomBuffer[0];
    }
  }

  public static getDefinition(): BlockDefinition {
    return BLOCK_DEFINITION;
  }

  public on(event: any, callback: (...args: any[]) => void) {
    this._emitter.on(event, callback);
    return this;
  }

  public emit(event: any, ...args: any[]) {
    this._emitter.emit(event, args?.[0]);
    return this;
  }

  public updateFromBlockInstance(instance: BlockInstance): void {
    if (!instance?.parameters) {
      return;
    }

    // if (this.locked) {
    //   const parameters = instance.parameters;
    //   const speedParam = parameters.find(p => p.id === 'speed');
    //   this.speed = Number(speedParam?.currentValue) || 1;
    //   console.log("start", parameters);

    //   return;
    // }

    // Check if there are any changes to process
    if (!instance.lastChanges) {
      return;
    }

    // const parameters = instance.parameters;
    const changedParameters = instance.lastChanges.parameters;

    // Only process parameters that have actually changed
    if (changedParameters) {
      const statesParam = changedParameters.find(p => p.id === 'states');
      const neighborsParam = changedParameters.find(p => p.id === 'neighbors');
      const lambdaParam = changedParameters.find(p => p.id === 'lambda');
      // const speedParam = changedParameters.find(p => p.id === 'speed');
      const isIsotropicParam = changedParameters.find(p => p.id === 'isIsotropic');
      const seedParam = changedParameters.find(p => p.id === 'seed');

      if (statesParam) this.states = Number(statesParam.currentValue);
      if (neighborsParam) this.neighbors = Number(neighborsParam.currentValue);
      if (lambdaParam) this.setRulesUsed(Number(lambdaParam.currentValue) * this.lambdaPath.length);
      if (isIsotropicParam) this.isIsotropic = isIsotropicParam.currentValue === 'true';
      if (seedParam !== undefined) this.newRuleSetData(Number(seedParam.currentValue));

      // Only regenerate world data if parameters that affect it have changed
      if (statesParam || neighborsParam || lambdaParam || isIsotropicParam || seedParam) {
        // this.newRuleSetData(this.seed);
        this.newWorldData();
        this.stop();
        this.start();
      }
    }
  }

  private start(speed?: number) {
    // this.intervalId = setInterval(() => this.nextGeneration(), 1000 / speed);
    this.intervalId = setInterval(() => this.nextGeneration(), 1000 / 8000);

  }

  private stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  private nextGeneration() {
    this.generationNumber++;
    const nextWorld = new (window.Uint8Array ? Uint8Array : Array)(this.worldSize);
    for (let i = 0; i < this.worldSize; i++) {
      const code = this.neighborhoodCode(i);
      if (this.ruleIsUsed[code]) {
        nextWorld[i] = this.rule[code];
      } else {
        nextWorld[i] = 0;
      }
    }
    this.currentWorld = nextWorld;
    // Emit the full world state for rendering
    this.emit('generation', this.currentWorld);
    // Emit the state of the center cell for audio output
    // this.emit('output', this.currentWorld[Math.floor(this.worldSize / 2)] / (this.states - 1));

    //// OUTPUT

    // this.shiftIndex = (this.shiftIndex + this.speed*0.01) % this.worldSize;
    // TODO это все нужно вынести в ворклет
    // и регулировку числа бит
    // и сдвига с внешним управлением
    this.shiftIndex = 0;
    const bitLength = 2;
    const binaryString = this.currentWorld.slice(this.shiftIndex, this.shiftIndex + bitLength).join('');
    const byteValue = parseInt(binaryString, this.states);
    const maxValue = Math.pow(this.states, bitLength) - 1;
    this.output.value = byteValue / maxValue;

  }

  private neighborhoodCode(n: number) {
    let code = 0;
    for (let i = 0; i < this.neighbors; i++) {
      code = code * this.states + this.getState(n + i - Math.floor(this.neighbors / 2));
    }
    return code;
  }

  private getState(n: number) {
    if (n < 0) {
      n += this.worldSize;
    } else if (n >= this.worldSize) {
      n -= this.worldSize;
    }
    return this.currentWorld[n];
  }

  // CREATE NEW RULE SET

  //   function doNewRules() {
  //     states  = Number(document.getElementById("states").value);
  //     neighbors  = Number(document.getElementById("neighbors").value);
  //     isIsotropic = document.getElementById("isotropic").checked;
  //     if (palette.length != states) {
  //         palette = DEFAULT_PALETTE;
  //     }
  //     newRuleSetData();
  //     doNewWorld();
  //     lambdaSlider.setStep(0,1/lambdaPath.length);
  //     document.getElementById("info").innerHTML = ruleInfo;
  //     document.getElementById("rulesused").value = "" + (rulesUsed+1);
  //     lambdaSlider.setValue(0, rulesUsed/lambdaPath.length);
  // }

  // нужно перезагружать каждый раз при изменении параметров правил
  private newRuleSetData(seed?: number) {
    const ruleSeed = seed || Math.floor(Math.pow(2, 32) * Math.random());
    // Simple seedable random number generator
    let seedState = ruleSeed;
    this.random = () => {
      let x = Math.sin(seedState++) * 10000;
      return x - Math.floor(x);
    }

    const ruleCt = Math.pow(this.states, this.neighbors);
    this.rule = window.Uint8Array ? new Uint8Array(ruleCt) : new Array(ruleCt);
    this.ruleIsUsed = window.Uint8Array ? new Uint8Array(ruleCt) : new Array(ruleCt);
    this.rule[0] = 0;
    for (let i = 1; i < ruleCt; i++) {
      this.ruleIsUsed[i] = 0;
      this.rule[i] = this.randInt(1, this.states - 1);
      if (this.isIsotropic)
        this.rule[this.isotropicMate(i)] = this.rule[i];
    }
    let lambdaCt;
    if (this.isIsotropic)
      lambdaCt = ((Math.pow(this.states, this.neighbors) + Math.pow(this.states, (this.neighbors + 1) / 2)) / 2) - 1;
    else
      lambdaCt = ruleCt - 1;
    this.lambdaPath = window.Uint32Array ? new Uint32Array(lambdaCt) : new Array(lambdaCt);
    let ct = 0;
    for (let i = 1; i < ruleCt; i++) {
      if (!this.ruleIsUsed[i]) {
        this.lambdaPath[ct] = i;
        ct++;
        this.ruleIsUsed[i] = 1;
        if (this.isIsotropic)
          this.ruleIsUsed[this.isotropicMate(i)] = 1;
      }
    }
    for (let i = 0; i < lambdaCt; i++) {
      const r = this.randInt(0, lambdaCt - 1);
      const temp = this.lambdaPath[i];
      this.lambdaPath[i] = this.lambdaPath[r];
      this.lambdaPath[r] = temp;
    }
    this.setRulesUsed(0.33 * lambdaCt);
  }

  // Create New World Using:
  // кнопка не нужна, перезапуск по изменении seed
  // для генерации начальных данных первой строки
  private newWorldData() {
    this.generationNumber = 0;
    this.currentWorld = window.Uint8Array ? new Uint8Array(this.worldSize) : new Array(this.worldSize);

    // заполнение мира 50 на 50
    for (let i = 0; i < this.worldSize; i++) {
      this.currentWorld[i] = (this.random() < 0.5) ? 0 : this.randInt(1, this.states - 1);
    }
  }

  private setRulesUsed(used: number) {
    this.rulesUsed = Math.round(used);
    if (this.rulesUsed < 0) this.rulesUsed = 0;
    else if (this.rulesUsed > this.lambdaPath.length) this.rulesUsed = this.lambdaPath.length;

    // Reset ruleIsUsed array
    for (let i = 0; i < this.ruleIsUsed.length; i++) this.ruleIsUsed[i] = 0;

    if (this.isIsotropic) {
      for (let i = 0; i < this.rulesUsed; i++) {
        const r = this.lambdaPath[i];
        this.ruleIsUsed[r] = 1;
        this.ruleIsUsed[this.isotropicMate(r)] = 1;
      }
    } else {
      for (let i = 0; i < this.rulesUsed; i++)
        this.ruleIsUsed[this.lambdaPath[i]] = 1;
    }
  }

  private isotropicMate(n: number) {
    let partner = 0;
    const s = this.states;
    for (let i = 0; i < this.neighbors; i++) {
      partner = partner * s + (n % s);
      n = Math.floor(n / s);
    }
    return partner;
  }

  private randInt(min: number, max: number) {
    return min + Math.floor((max - min + 1) * this.random());
  }

  dispose() {
    this.stop();
    this._emitter.dispose();
  }
}
