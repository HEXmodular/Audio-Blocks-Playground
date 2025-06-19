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
    ManagedAudioWorkletNodeMessage 
} from '@interfaces/common';
import * as Tone from 'tone'; // Import Tone

import { RULE_110_OSCILLATOR_BLOCK_DEFINITION } from '@constants/automata';

export const PREDEFINED_WORKLET_DEFS: BlockDefinition[] = [
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
  removeAllManagedAudioWorkletNodes: () => void; // Ensures this is the exact name and declared once
  requestSamplesFromWorklet: (instanceId: string, timeoutMs?: number) => Promise<Float32Array>;
  audioInitializationErrorLocal: string | null;
  removeNode: (nodeId: string) => void;
  getNodeInfo: (nodeId: string) => ManagedWorkletNodeInfo | undefined;
  getAllNodeInfo: () => ManagedWorkletNodeInfo[];
  sendMessage: (nodeId: string, message: ManagedAudioWorkletNodeMessage) => void;
  setAudioContext(context: AudioContext | null): void;
  getManagedNodesMap(): Map<string, ManagedWorkletNodeInfo>;
}

class AudioWorkletManager implements IAudioWorkletManager {
  private static instance: AudioWorkletManager | null = null;

  public isAudioWorkletSystemReady: boolean = false;
  public audioInitializationErrorLocal: string | null = null;
  private registeredWorkletNamesRef: Set<string>;
  private managedWorkletNodesRef: Map<string, ManagedWorkletNodeInfo>;
  private audioContext: AudioContext | null;
  private readonly onStateChangeForReRender: () => void;
  private dynamicallyRegisteredDefs: BlockDefinition[] = [];

  private constructor() {
    this.audioContext = Tone.getContext().rawContext || null;
    // this.onStateChangeForReRender = onStateChangeForReRender;
    this.registeredWorkletNamesRef = new Set<string>();
    this.managedWorkletNodesRef = new Map<string, ManagedWorkletNodeInfo>();
  }

  public static getInstance(): AudioWorkletManager {
    if (!AudioWorkletManager.instance) {
      AudioWorkletManager.instance = new AudioWorkletManager();
    }
    return AudioWorkletManager.instance;
  }

  public static resetInstance(): void {
    AudioWorkletManager.instance = null;
  }

  public setAudioContext(newContext: AudioContext | null): void {
    if (this.audioContext !== newContext) {
      if (this.managedWorkletNodesRef.size > 0) {
          console.warn("[AudioWorkletManager] AudioContext changed/nulled. Removing all existing managed worklet nodes.");
          this.removeAllManagedAudioWorkletNodes();
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
      if (error.message.includes('is already registered') || (error.name === 'NotSupportedError' && error.message.includes(processorName) && error.message.toLowerCase().includes('already registered'))) {
        this.registeredWorkletNamesRef.add(processorName);
        return true;
      }
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
            break;
          }
        }
      }
    }
    return allEffectivelyRegistered;
  }

  public registerWorkletDefinition(definition: BlockDefinition): void {
    if (definition.audioWorkletProcessorName && definition.audioWorkletCode) {
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
    _initialParams: BlockParameter[]
  ): Promise<boolean> {
    if (!this.audioContext || this.audioContext.state !== 'running' || !this.isAudioWorkletSystemReady) {
      console.warn(`[AudioWorkletManager] setupManagedAudioWorkletNode called for ${instanceId}`, {
        audioContext: !this.audioContext,
        audioContextState: this.audioContext && this.audioContext.state !== 'running',
        isAudioWorkletSystemRead: !this.isAudioWorkletSystemReady,
      });
      return false;
    }
    if (!definition.audioWorkletProcessorName || !definition.audioWorkletCode) {
      console.warn(`[AudioWorkletManager] setupManagedAudioWorkletNode called for ${instanceId} but definition is missing audioWorkletProcessorName or audioWorkletCode.`);
      return false;
    }

    if (this.managedWorkletNodesRef.has(instanceId)) {
      return true;
    }

    console.warn(`[AudioWorkletManager] setupManagedAudioWorkletNode for ${definition.audioWorkletProcessorName} (instance ${instanceId}) needs generic implementation. Currently a placeholder.`, definition);
    return false;
  }

  public updateManagedAudioWorkletNodeParams(instanceId: string, parameters: BlockParameter[]): void {
    if (!this.audioContext || this.audioContext.state !== 'running') return;
    const info = this.managedWorkletNodesRef.get(instanceId);
    if (!info) return;
    parameters.forEach(param => {
      const audioParam = info.node.parameters.get(param.id);
      if (audioParam && typeof param.currentValue === 'number') {
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

  public removeAllManagedAudioWorkletNodes(): void {
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

export default AudioWorkletManager.getInstance();