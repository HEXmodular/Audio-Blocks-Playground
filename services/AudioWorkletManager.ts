/**
 * This service is dedicated to managing AudioWorklet nodes, enabling custom audio processing via JavaScript in a separate, high-priority thread.
 * It handles the entire lifecycle of AudioWorklets, including the dynamic registration of `AudioWorkletProcessor` code from strings and the instantiation of `AudioWorkletNode` instances.
 * The manager maintains a registry of predefined and dynamically added worklets, ensuring they are loaded and ready before nodes are created.
 * Key functionalities include setting up new worklet nodes with specific parameters and processor options, updating their parameters in real-time, sending and receiving messages via their communication port, and managing their removal.
 * It also provides utilities like requesting recent audio samples from a worklet, crucial for visualization or analysis, and signals its readiness state to the rest of the audio system.
 */
import {
    BlockDefinition,
    BlockParameter,
    AudioContextState,
    ManagedWorkletNodeInfo, 
    // AudioWorkletNodeOptions, 
    ManagedAudioWorkletNodeMessage 
} from '@interfaces/common';
import { RULE_110_OSCILLATOR_BLOCK_DEFINITION } from '@constants/automata';

// const SYSTEM_AUDIO_OUTPUT_ID = 'system-audio-output-v1'; // Removed constant

export const PREDEFINED_WORKLET_DEFS: BlockDefinition[] = [
    // OSCILLATOR_BLOCK_DEFINITION,
    // AudioEngineService.getAudioOutputDefinition(), // Removed
    RULE_110_OSCILLATOR_BLOCK_DEFINITION,
];

export interface IAudioWorkletManager {
  isAudioWorkletSystemReady: boolean;
  setIsAudioWorkletSystemReady: (ready: boolean) => void;
  registerWorkletProcessor: (processorName: string, workletCode: string) => Promise<boolean>;
  checkAndRegisterPredefinedWorklets: (logActivity?: boolean) => Promise<boolean>;
  setupManagedAudioWorkletNode: (instanceId: string, definition: BlockDefinition, initialParams: BlockParameter[]) => Promise<boolean>;
  updateManagedAudioWorkletNodeParams: (instanceId: string, parameters: BlockParameter[]) => void;
  sendManagedAudioWorkletNodeMessage: (instanceId: string, message: any) => void;
  removeManagedAudioWorkletNode: (instanceId: string) => void;
  removeAllManagedWorkletNodes: () => void;
  requestSamplesFromWorklet: (instanceId: string, timeoutMs?: number) => Promise<Float32Array>;
  audioInitializationErrorLocal: string | null;

  // Added methods to match usage in AudioEngineService
  removeNode: (nodeId: string) => void;
  getNodeInfo: (nodeId: string) => ManagedWorkletNodeInfo | undefined;
  getAllNodeInfo: () => ManagedWorkletNodeInfo[];
  sendMessage: (nodeId: string, message: ManagedAudioWorkletNodeMessage) => void;
}

export class AudioWorkletManager implements IAudioWorkletManager {
  public isAudioWorkletSystemReady: boolean = false;
  public audioInitializationErrorLocal: string | null = null;
  private registeredWorkletNamesRef: Set<string>;
  private managedWorkletNodesRef: Map<string, ManagedWorkletNodeInfo>;
  private audioContext: AudioContext | null;
  private readonly onStateChangeForReRender: () => void;
  private dynamicallyRegisteredDefs: BlockDefinition[] = []; // Added

  constructor(audioContext: AudioContext | null, onStateChangeForReRender: () => void) {
    this.audioContext = audioContext;
    this.onStateChangeForReRender = onStateChangeForReRender;
    this.registeredWorkletNamesRef = new Set<string>();
    this.managedWorkletNodesRef = new Map<string, ManagedWorkletNodeInfo>();
  }

  public _setAudioContext(newContext: AudioContext | null): void {
    if (this.audioContext !== newContext) {
      if (this.managedWorkletNodesRef.size > 0) {
          console.warn("[AudioWorkletManager] AudioContext changed/nulled. Removing all existing managed worklet nodes.");
          this.removeAllManagedWorkletNodes();
      }
      this.registeredWorkletNamesRef.clear();
      this.isAudioWorkletSystemReady = false;
      this.audioContext = newContext;
      this.onStateChangeForReRender();
    }
  }

  public setIsAudioWorkletSystemReady(ready: boolean): void {
    if (this.isAudioWorkletSystemReady !== ready) {
      this.isAudioWorkletSystemReady = ready;
    }
  }

  private setAudioInitializationError(error: string | null): void {
    if (this.audioInitializationErrorLocal !== error) {
      this.audioInitializationErrorLocal = error;
      if (error) console.error(`[WorkletManager Error] ${error}`, error);
      this.onStateChangeForReRender();
    }
  }

  public async registerWorkletProcessor(
    processorName: string,
    workletCode: string
  ): Promise<boolean> {
    if (!this.audioContext) {
      console.error(`[WorkletManager Critical] Cannot register worklet ${processorName}: AudioContext is null.`);
      return false;
    }
    if (this.registeredWorkletNamesRef.has(processorName)) {
      return true;
    }
    if (!workletCode || !processorName) {
      console.error(`[WorkletManager Critical] Cannot register worklet ${processorName}: missing code or name.`);
      return false;
    }
    if (this.audioContext.state === 'closed') {
      console.warn(`[WorkletManager Warn] Cannot register worklet ${processorName}: context is closed.`);
      return false;
    }

    let actualClassName: string | null = null;
    let objectURL: string | null = null;
    try {
      const classNameMatch = workletCode.match(/class\s+([A-Za-z_][A-Za-z0-9_]*)\s+extends\s+AudioWorkletProcessor/);
      if (classNameMatch && classNameMatch[1]) {
        actualClassName = classNameMatch[1];
      } else {
        actualClassName = processorName.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
        actualClassName = actualClassName.charAt(0).toUpperCase() + actualClassName.slice(1);
        console.warn(`[WorkletManager Warn] Could not extract class name for worklet '${processorName}' via regex. Falling back to heuristic: '${actualClassName}'.`);
      }

      if (!actualClassName) {
        console.error(`[WorkletManager Critical] FATAL: Could not determine class name for worklet '${processorName}'.`);
        this.setAudioInitializationError(`Class name determination failed for ${processorName}`);
        return false;
      }

      const finalCode = `${workletCode}

try {
  registerProcessor('${processorName}', ${actualClassName});
} catch(e) {
  const err = e; // Cast to Error
  if (err.name !== 'NotSupportedError' || (err.message && !err.message.includes('already registered'))) {
    console.error("Error in registerProcessor call for ${processorName} ('${actualClassName}') within worklet script:", err);
    throw err;
  }
}`;
      const blob = new Blob([finalCode], { type: 'application/javascript' });
      objectURL = URL.createObjectURL(blob);
      await this.audioContext.audioWorklet.addModule(objectURL);
      this.registeredWorkletNamesRef.add(processorName);
      return true;
    } catch (e) {
      const error = e as Error;
      // const cnForErrorLog = actualClassName || "[class name not determined before error]"; // Part of unused errMsgBase
      // const errMsgBase = `Error in registerWorkletProcessor for '${processorName}' (class '${cnForErrorLog}')`; // Unused variable

      if (error.message.includes('is already registered') || (error.name === 'NotSupportedError' && error.message.includes(processorName) && error.message.toLowerCase().includes('already registered'))) {
        this.registeredWorkletNamesRef.add(processorName);
        return true;
      }
      // console.error(`RegFail ('${processorName}'):`, finalCode)
      this.setAudioInitializationError(`RegFail ('${processorName}'): ${error.message.substring(0, 100)}`);
      this.registeredWorkletNamesRef.delete(processorName);
      return false;
    } finally {
      if (objectURL) URL.revokeObjectURL(objectURL);
    }
  }

  public async checkAndRegisterPredefinedWorklets(logActivity: boolean = true): Promise<boolean> {
    if (!this.audioContext) {
      if (logActivity) console.log(`[WorkletManager Worklets] AudioContext is null. Cannot register worklets.`);
      return false;
    }
    const currentState: AudioContextState = this.audioContext.state;

    const allDefsToConsider = [...PREDEFINED_WORKLET_DEFS, ...this.dynamicallyRegisteredDefs];

    const allCached = allDefsToConsider.every(def =>
      !def.audioWorkletCode || !def.audioWorkletProcessorName || this.registeredWorkletNamesRef.has(def.audioWorkletProcessorName!)
    );

    if (currentState === 'suspended') {
      return allCached;
    }
    if (currentState === 'closed') {
      return false;
    }

    let allEffectivelyRegistered = true;
    for (const def of allDefsToConsider) {
      if (def.audioWorkletCode && def.audioWorkletProcessorName) {
        if (!this.registeredWorkletNamesRef.has(def.audioWorkletProcessorName)) {
          const regSuccess = await this.registerWorkletProcessor(def.audioWorkletProcessorName, def.audioWorkletCode);
          if (!regSuccess) {
            allEffectivelyRegistered = false;
            // console.warn(`[WorkletManager Worklets] Failed to register ${def.audioWorkletProcessorName}, stopping further registrations in this pass.`);
            break;
          }
        }
      }
    }
    return allEffectivelyRegistered;
  }

  public registerWorkletDefinition(definition: BlockDefinition): void {
    if (definition.audioWorkletProcessorName && definition.audioWorkletCode) {
      // Avoid duplicates if called multiple times
      const alreadyExists = PREDEFINED_WORKLET_DEFS.some(d => d.id === definition.id) ||
                            this.dynamicallyRegisteredDefs.some(d => d.id === definition.id);
      if (!alreadyExists) {
        this.dynamicallyRegisteredDefs.push(definition);
      }
    } else {
      console.warn(`[AudioWorkletManager] Attempted to register worklet definition "${definition.name}" but it's missing processorName or workletCode.`);
    }
  }

  public async setupManagedAudioWorkletNode(
    instanceId: string,
    definition: BlockDefinition,
    _initialParams: BlockParameter[] // Prefixed with underscore as it's not used in placeholder
  ): Promise<boolean> {
    if (!this.audioContext || this.audioContext.state !== 'running' || !this.isAudioWorkletSystemReady) {
      console.warn(`[AudioWorkletManager] setupManagedAudioWorkletNode called for ${instanceId}`, {
        audioContext: !this.audioContext,
        audioContextState: this.audioContext && this.audioContext.state !== 'running',
        isAudioWorkletSystemRead: !this.isAudioWorkletSystemReady,
      });
      return false;
    }
    // Guard to ensure processorName and code are present; if not, setup cannot proceed.
    // This guard was ALREADY here and should ensure definition.audioWorkletProcessorName is a string.
    if (!definition.audioWorkletProcessorName || !definition.audioWorkletCode) {
      console.warn(`[AudioWorkletManager] setupManagedAudioWorkletNode called for ${instanceId} but definition is missing audioWorkletProcessorName or audioWorkletCode.`);
      return false;
    }

    // The previously narrowed 'processorName' and 'workletCode' variables are removed to use definition properties directly as requested.
    // const processorName = definition.audioWorkletProcessorName; // No longer using this narrowed variable for constructor
    // const workletCode = definition.audioWorkletCode; // No longer using this

    if (this.managedWorkletNodesRef.has(instanceId)) {
      return true;
    }

    // Using definition.audioWorkletProcessorName directly. The guard above should make it safe.
    // if (!this.registeredWorkletNamesRef.has(definition.audioWorkletProcessorName)) {
    //   // The guard for definition.audioWorkletCode is also above.
    //   const regSuccess = await this.registerWorkletProcessor(definition.audioWorkletProcessorName, definition.audioWorkletCode);
    //   if (!regSuccess) {
    //     this.setAudioInitializationError(`WorkletNode RegFail: ${definition.audioWorkletProcessorName}`);
    //     return false;
    //   }
    // }

    // Final explicit check for processorName type before use - removed as per instruction to use definition.audioWorkletProcessorName directly in constructor
    // if (typeof processorName !== 'string') { ... }

    // try {
    //   const paramDescriptors: Record<string, any> = {};
    //   definition.parameters.forEach(p => {
    //       if (p.type === 'slider' || p.type === 'knob' || p.type === 'number_input') {
    //           const initialVal = initialParams.find(ip => ip.id === p.id)?.currentValue;
    //           let valueToSet = 0;
    //           if (typeof initialVal === 'number') {
    //               valueToSet = initialVal;
    //           } else if (typeof p.defaultValue === 'number') {
    //               valueToSet = p.defaultValue;
    //           }
    //           paramDescriptors[p.id] = valueToSet;
    //       }
    //   });

      // Find initial parameter values or use definition defaults, with final fallbacks
      // const waveformParam = initialParams.find(p => p.id === 'waveform');
      // const coreLengthParam = initialParams.find(p => p.id === 'core_length');
      // const initialPatternParam = initialParams.find(p => p.id === 'initial_pattern_plus_boundaries');
      // const outputModeParam = initialParams.find(p => p.id === 'output_mode');

      // const workletNodeOptions: AudioWorkletNodeOptions = {
      //     processorOptions: {
      //         instanceId: instanceId,
      //         sampleRate: this.audioContext!.sampleRate,
      //         ...(definition.id === OSCILLATOR_BLOCK_DEFINITION.id && {
      //             waveform: waveformParam?.currentValue ?? OSCILLATOR_BLOCK_DEFINITION.parameters.find(p => p.id === 'waveform')?.defaultValue ?? 'sine'
      //         }),
      //         ...(definition.id === RULE_110_OSCILLATOR_BLOCK_DEFINITION.id && {
      //             coreLength: coreLengthParam?.currentValue ?? RULE_110_OSCILLATOR_BLOCK_DEFINITION.parameters.find(p => p.id === 'core_length')?.defaultValue ?? 8,
      //             initialPattern: initialPatternParam?.currentValue ?? RULE_110_OSCILLATOR_BLOCK_DEFINITION.parameters.find(p => p.id === 'initial_pattern_plus_boundaries')?.defaultValue ?? Array(18).fill(false),
      //             outputMode: outputModeParam?.currentValue ?? RULE_110_OSCILLATOR_BLOCK_DEFINITION.parameters.find(p => p.id === 'output_mode')?.defaultValue ?? 'sum_bits',
      //         }),
      //     },
      //     parameterData: paramDescriptors,
      // };

      // Add the new guard immediately before the AudioWorkletNode constructor
      if (!definition.audioWorkletProcessorName) {
        console.error('CRITICAL: audioWorkletProcessorName is undefined before AudioWorkletNode construction for instanceId:', instanceId);
        return false;
      }
      // After the guard, definition.audioWorkletProcessorName is known to be a non-empty string.
      // Applying non-null assertion operator as requested.
      // console.log('[AudioWorkletManager] TEMP LOG: Before new AudioWorkletNode. Processor name:', definition.audioWorkletProcessorName); // Removing temporary log
      // const newNode = new AudioWorkletNode(this.audioContext!, definition.audioWorkletProcessorName!, workletNodeOptions);

    //   newNode.port.onmessage = (event) => {
    //     console.log(`[AudioWorkletManager] Message FROM Worklet (${instanceId}):`, event.data);
    //   };
    //   let inputGainNodeForOutputBlock: GainNode | undefined = undefined;
    //   if (definition.id === SYSTEM_AUDIO_OUTPUT_ID) { // Changed
    //     inputGainNodeForOutputBlock = this.audioContext!.createGain();
    //     const volumeParam = initialParams.find(p => p.id === 'volume');
    //     inputGainNodeForOutputBlock.gain.value = volumeParam ? Number(volumeParam.currentValue) : 0.7;
    //     inputGainNodeForOutputBlock.connect(newNode);
    //   }
    //   this.managedWorkletNodesRef.set(instanceId, { node: newNode, definition, instanceId, inputGainNode: inputGainNodeForOutputBlock });
    //   this.onStateChangeForReRender();
    //   return true;
    // } catch (e: any) {
    //   // Use definition.audioWorkletProcessorName in error message, ensuring it's not undefined due to the guard.
    //   const procNameForError = definition.audioWorkletProcessorName || "UNKNOWN_PROCESSOR";
    //   // const errMsg = `Failed to construct '${procNameForError}' for '${instanceId}': ${e.message}`; // Unused variable
    //   this.setAudioInitializationError(`WorkletNode Error: ${procNameForError} - ${e.message.substring(0, 100)}`);
    //   return false;
    // }

    // Simplified setupManagedAudioWorkletNode:
    // The entire try-catch block that created the AudioWorkletNode and potentially an inputGainNode
    // has been commented out in the provided source.
    // Assuming the goal is to make this function generic and remove specific SYSTEM_AUDIO_OUTPUT_ID handling,
    // the logic for creating 'newNode' and setting it in 'managedWorkletNodesRef' would be here,
    // but without the 'inputGainNodeForOutputBlock' part.

    // Since the original code for creating newNode and setting it in the map is commented out,
    // I will proceed with the understanding that the commented out section is the target for removal
    // of special audio output handling. The console.warn and 'return false' will remain as a placeholder
    // for the actual generic node creation logic that should exist.

    console.warn(`[AudioWorkletManager] setupManagedAudioWorkletNode for ${definition.audioWorkletProcessorName} (instance ${instanceId}) needs generic implementation. Currently a placeholder.`, definition);
    // Placeholder for generic node creation:
    // try {
    //   const newNode = new AudioWorkletNode(this.audioContext!, definition.audioWorkletProcessorName!, workletNodeOptions);
    //   newNode.port.onmessage = (event) => { /* ... */ };
    //   this.managedWorkletNodesRef.set(instanceId, { node: newNode, definition, instanceId /*, inputGainNode: null (or undefined) */ });
    //   this.onStateChangeForReRender();
    //   return true;
    // } catch (e) { /* ... */ return false; }
    return false;
  }

  public updateManagedAudioWorkletNodeParams(instanceId: string, parameters: BlockParameter[]): void {
    if (!this.audioContext || this.audioContext.state !== 'running') return;
    const info = this.managedWorkletNodesRef.get(instanceId);
    if (!info) return;
    parameters.forEach(param => {
      const audioParam = info.node.parameters.get(param.id);
      if (audioParam && typeof param.currentValue === 'number') {
        // Removed special handling for SYSTEM_AUDIO_OUTPUT_ID and info.inputGainNode
        audioParam.setTargetAtTime(Number(param.currentValue), this.audioContext!.currentTime, 0.01);
      }
    });
  }

  public sendManagedAudioWorkletNodeMessage(instanceId: string, message: any): void {
    const info = this.managedWorkletNodesRef.get(instanceId);
    if (info && info.node.port) {
      console.log(`[AudioWorkletManager] Message TO Worklet (${instanceId}):`, message);
      info.node.port.postMessage(message);
    }
  }

  public removeManagedAudioWorkletNode(instanceId: string): void {
    const info = this.managedWorkletNodesRef.get(instanceId);
    if (info) {
      try {
        if (info.inputGainNode) {
          info.inputGainNode.disconnect();
        }
        info.node.disconnect();
        info.node.port?.close();
      } catch (e) {
        console.warn(`[WorkletManager NodeRemove] Error disconnecting worklet '${instanceId}': ${(e as Error).message}`);
      }
      this.managedWorkletNodesRef.delete(instanceId);
      console.log(`[WorkletManager NodeRemove] Removed worklet node for '${instanceId}'.`);
      this.onStateChangeForReRender();
    }
  }

  public removeAllManagedWorkletNodes(): void {
    this.managedWorkletNodesRef.forEach((info) => {
      if (info.instanceId) {
        this.removeManagedAudioWorkletNode(info.instanceId);
      } else {
        console.warn(`[WorkletManager] Removing AudioworletNode failed.`, info);
      }
    });
     console.log(`[WorkletManager] All managed worklet nodes signal sent for removal.`);
  }

  public async requestSamplesFromWorklet(instanceId: string, timeoutMs: number = 1000): Promise<Float32Array> {
    const workletInfo = this.managedWorkletNodesRef.get(instanceId);
    if (!workletInfo || !workletInfo.node.port) {
      throw new Error(`WorkletNode or port not found for instance ${instanceId}`);
    }
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Timeout waiting for samples from worklet ${instanceId} after ${timeoutMs}ms`));
      }, timeoutMs);
      const specificMessageListener = (event: MessageEvent) => {
        if (event.data?.type === 'RECENT_SAMPLES_DATA' && event.data.samples instanceof Float32Array) {
          clearTimeout(timeoutId);
          workletInfo.node.port.removeEventListener('message', specificMessageListener);
          resolve(event.data.samples);
        }
      };
      workletInfo.node.port.addEventListener('message', specificMessageListener);
      this.sendManagedAudioWorkletNodeMessage(instanceId, { type: 'GET_RECENT_SAMPLES' });
    });
  }

  public getManagedNodesMap(): Map<string, ManagedWorkletNodeInfo> {
    return this.managedWorkletNodesRef;
  }

  // Public methods to match AudioEngineService calls
  public removeNode(nodeId: string): void {
    this.removeManagedAudioWorkletNode(nodeId);
  }
  public getNodeInfo(nodeId: string): ManagedWorkletNodeInfo | undefined {
    return this.managedWorkletNodesRef.get(nodeId);
  }
  public getAllNodeInfo(): ManagedWorkletNodeInfo[] {
    return Array.from(this.managedWorkletNodesRef.values());
  }
  public sendMessage(nodeId: string, message: ManagedAudioWorkletNodeMessage): void {
    this.sendManagedAudioWorkletNodeMessage(nodeId, message);
  }
}
