/**
 * This service is dedicated to managing AudioWorklet nodes, enabling custom audio processing via JavaScript in a separate, high-priority thread.
 * It handles the entire lifecycle of AudioWorklets, including the dynamic registration of `AudioWorkletProcessor` code from strings and the instantiation of `AudioWorkletNode` instances.
 * The manager maintains a registry of predefined and dynamically added worklets, ensuring they are loaded and ready before nodes are created.
 * Key functionalities include setting up new worklet nodes with specific parameters and processor options, updating their parameters in real-time, sending and receiving messages via their communication port, and managing their removal.
 * It also provides utilities like requesting recent audio samples from a worklet, crucial for visualization or analysis, and signals its readiness state to the rest of the audio system.
 */
import { BlockDefinition, BlockParameter, AudioContextState } from '../types';
import {
    OSCILLATOR_BLOCK_DEFINITION,
    AUDIO_OUTPUT_BLOCK_DEFINITION,
    RULE_110_OSCILLATOR_BLOCK_DEFINITION,
} from '../constants';

export const PREDEFINED_WORKLET_DEFS: BlockDefinition[] = [
    OSCILLATOR_BLOCK_DEFINITION,
    AUDIO_OUTPUT_BLOCK_DEFINITION,
    RULE_110_OSCILLATOR_BLOCK_DEFINITION,
];

export interface ManagedWorkletNodeInfo {
  node: AudioWorkletNode;
  definition: BlockDefinition;
  instanceId: string;
  inputGainNode?: GainNode;
}

export interface IAudioWorkletManager {
  isAudioWorkletSystemReady: boolean;
  setIsAudioWorkletSystemReady: (ready: boolean) => void; // This will become a direct setter or a method
  registerWorkletProcessor: (processorName: string, workletCode: string) => Promise<boolean>;
  checkAndRegisterPredefinedWorklets: (logActivity?: boolean) => Promise<boolean>;
  setupManagedAudioWorkletNode: (instanceId: string, definition: BlockDefinition, initialParams: BlockParameter[]) => Promise<boolean>;
  updateManagedAudioWorkletNodeParams: (instanceId: string, parameters: BlockParameter[]) => void;
  sendManagedAudioWorkletNodeMessage: (instanceId: string, message: any) => void;
  removeManagedAudioWorkletNode: (instanceId: string) => void;
  removeAllManagedWorkletNodes: () => void;
  requestSamplesFromWorklet: (instanceId: string, timeoutMs?: number) => Promise<Float32Array>;
  // managedWorkletNodesRef will become a private property, so it's not part of the public interface.
  // audioInitializationErrorLocal will also be a public property.
  audioInitializationErrorLocal: string | null;
}

export class AudioWorkletManager implements IAudioWorkletManager {
  public isAudioWorkletSystemReady: boolean = false;
  public audioInitializationErrorLocal: string | null = null;

  private registeredWorkletNamesRef: Set<string>;
  private managedWorkletNodesRef: Map<string, ManagedWorkletNodeInfo>;

  // Make audioContext mutable for updates from AudioEngine
  private audioContext: AudioContext | null;
  private readonly onStateChangeForReRender: () => void;

  constructor(audioContext: AudioContext | null, onStateChangeForReRender: () => void) {
    this.audioContext = audioContext;
    this.onStateChangeForReRender = onStateChangeForReRender;
    this.registeredWorkletNamesRef = new Set<string>();
    this.managedWorkletNodesRef = new Map<string, ManagedWorkletNodeInfo>();
  }

  /**
   * Allows AudioEngine to update the AudioContext for this manager.
   * This is crucial if the context is recreated or changed.
   * @param newContext The new AudioContext, or null if it's destroyed.
   */
  public _setAudioContext(newContext: AudioContext | null): void {
    if (this.audioContext !== newContext) {
      // If context changes or becomes null, existing nodes and registrations are invalid.
      // Call removeAllManagedWorkletNodes to disconnect and clear them.
      // Also clear registered names.
      if (this.managedWorkletNodesRef.size > 0) {
          console.warn("[AudioWorkletManager] AudioContext changed/nulled. Removing all existing managed worklet nodes.");
          this.removeAllManagedWorkletNodes(); // This should also clear managedWorkletNodesRef
      }
      this.registeredWorkletNamesRef.clear();
      this.isAudioWorkletSystemReady = false; // System is no longer ready with a new/null context until re-checked

      this.audioContext = newContext;
      // Potentially trigger a re-check of predefined worklets if context becomes non-null
      // However, AudioEngine will likely call checkAndRegisterPredefinedWorklets after context initialization.
      this.onStateChangeForReRender(); // Notify if state relevant to UI (e.g. isAudioWorkletSystemReady) changed
    }
  }

  public setIsAudioWorkletSystemReady(ready: boolean): void {
    if (this.isAudioWorkletSystemReady !== ready) {
      this.isAudioWorkletSystemReady = ready;
      // No direct call to onStateChangeForReRender here as per original hook's comment,
      // but if other parts of the class now depend on this for re-render, it might be needed.
      // The original hook comment said: "// onStateChangeForReRender(); // Managed by useAudioEngine if it needs to react"
      // For now, let's assume direct state mutation is fine and consumers will react if necessary,
      // or onStateChangeForReRender is called by other methods that change state.
    }
  }

  private setAudioInitializationError(error: string | null): void {
    if (this.audioInitializationErrorLocal !== error) {
      this.audioInitializationErrorLocal = error;
      if (error) console.error(`[WorkletManager Error] ${error}`);
      this.onStateChangeForReRender();
    }
  }

  public async registerWorkletProcessor(
    processorName: string,
    workletCode: string
  ): Promise<boolean> {
    console.log(`[AudioWorkletManager Register DEBUG] Attempting to register worklet processor: ${processorName}`);
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
  const err = e; // Removed 'as Error'
  if (err.name !== 'NotSupportedError' || (err.message && !err.message.includes('already registered'))) {
    console.error("Error in registerProcessor call for ${processorName} ('${actualClassName}') within worklet script:", err);
    throw err;
  } else {
    // Optional: console.log for debugging that the suppression happened within the blob, e.g.:
    // console.log("Processor '${processorName}' ('${actualClassName}') already registered, error caught and suppressed within worklet script blob.");
  }
}`;
      const blob = new Blob([finalCode], { type: 'application/javascript' });
      objectURL = URL.createObjectURL(blob);
      console.log(`[AudioWorkletManager Register DEBUG] Calling audioWorklet.addModule for ${processorName} with URL: ${objectURL}`);
      await this.audioContext.audioWorklet.addModule(objectURL);
      this.registeredWorkletNamesRef.add(processorName);
      return true;
    } catch (e) {
      const error = e as Error;
      const cnForErrorLog = actualClassName || "[class name not determined before error]";
      const errMsgBase = `Error in registerWorkletProcessor for '${processorName}' (class '${cnForErrorLog}')`;

      if (error.message.includes('is already registered') || (error.name === 'NotSupportedError' && error.message.includes(processorName) && error.message.toLowerCase().includes('already registered'))) {
        console.log(`[AudioWorkletManager Register DEBUG] Worklet '${processorName}' already registered or addModule indicated so. Adding to cache.`);
        this.registeredWorkletNamesRef.add(processorName);
        return true;
      }
      const errMsg = `${errMsgBase}: ${error.message}`;
      console.error(`[AudioWorkletManager Register DEBUG Critical] ${errMsg}`, e);
      this.setAudioInitializationError(`RegFail ('${processorName}'): ${error.message.substring(0, 100)}`);
      this.registeredWorkletNamesRef.delete(processorName);
      return false;
    } finally {
      if (objectURL) URL.revokeObjectURL(objectURL);
    }
  }

  public async checkAndRegisterPredefinedWorklets(logActivity: boolean = true): Promise<boolean> {
    console.log(`[AudioWorkletManager Worklets DEBUG] checkAndRegisterPredefinedWorklets called. logActivity: ${logActivity}`);
    if (!this.audioContext) {
      if (logActivity) console.log(`[WorkletManager Worklets] AudioContext is null. Cannot register worklets.`);
      return false;
    }
    const currentState: AudioContextState = this.audioContext.state;
    const allCached = PREDEFINED_WORKLET_DEFS.every(def =>
      !def.audioWorkletCode || !def.audioWorkletProcessorName || this.registeredWorkletNamesRef.has(def.audioWorkletProcessorName)
    );

    if (currentState === 'suspended') {
      if (logActivity) console.log(`[AudioWorkletManager Worklets DEBUG] Context is 'suspended'. All cached: ${allCached}. Cannot actively register.`);
      return allCached;
    }
    if (currentState === 'closed') {
      if (logActivity) console.warn(`[AudioWorkletManager Worklets DEBUG] Context is 'closed'. Not ready. All cached: ${allCached}. Cannot actively register.`);
      return false;
    }
    if (logActivity) console.log(`[AudioWorkletManager Worklets DEBUG] Context is 'running'. Proceeding with registration check.`);

    let allEffectivelyRegistered = true;
    for (const def of PREDEFINED_WORKLET_DEFS) {
      if (def.audioWorkletCode && def.audioWorkletProcessorName) {
        console.log(`[AudioWorkletManager Worklets DEBUG] Checking predefined worklet: ${def.audioWorkletProcessorName}`);
        if (!this.registeredWorkletNamesRef.has(def.audioWorkletProcessorName)) {
          if (logActivity) console.log(`[AudioWorkletManager Worklets DEBUG] Attempting registration for '${def.audioWorkletProcessorName}'...`);
          const regSuccess = await this.registerWorkletProcessor(def.audioWorkletProcessorName, def.audioWorkletCode);
          if (!regSuccess) {
            allEffectivelyRegistered = false;
            if (logActivity) console.error(`[AudioWorkletManager Worklets DEBUG] Predefined worklet '${def.audioWorkletProcessorName}' registration FAILED.`);
            break;
          } else {
            if (logActivity) console.log(`[AudioWorkletManager Worklets DEBUG] Predefined worklet '${def.audioWorkletProcessorName}' registration SUCCEEDED.`);
          }
        } else {
          if (logActivity) console.log(`[AudioWorkletManager Worklets DEBUG] Predefined worklet '${def.audioWorkletProcessorName}' already cached.`);
        }
      }
    }
    console.log(`[AudioWorkletManager Worklets DEBUG] Finished checkAndRegisterPredefinedWorklets. Result: ${allEffectivelyRegistered}`);
    return allEffectivelyRegistered;
  }

  public async setupManagedAudioWorkletNode(
    instanceId: string,
    definition: BlockDefinition,
    initialParams: BlockParameter[]
  ): Promise<boolean> {
    console.log(`[AudioWorkletManager NodeSetup DEBUG] Attempting setup for instanceId: ${instanceId}, definition: ${definition.name} (ID: ${definition.id})`);
    console.log(`[AudioWorkletManager NodeSetup DEBUG] Current state: isAudioWorkletSystemReady: ${this.isAudioWorkletSystemReady}, audioContext.state: ${this.audioContext?.state}`);

    if (!this.audioContext || this.audioContext.state !== 'running' || !this.isAudioWorkletSystemReady) {
      console.warn(`[AudioWorkletManager NodeSetup DEBUG] Cannot setup '${definition.name}' (ID: ${instanceId}): System not ready (ctx: ${this.audioContext?.state}, worklets: ${this.isAudioWorkletSystemReady}). SKIPPING.`);
      return false;
    }
    if (!definition.audioWorkletProcessorName || !definition.audioWorkletCode) {
      console.log(`[AudioWorkletManager NodeSetup DEBUG] Skipping '${definition.name}' (ID: ${instanceId}): Missing processorName or code. SKIPPING.`);
      return true;
    }
    if (this.managedWorkletNodesRef.has(instanceId)) {
      console.log(`[AudioWorkletManager NodeSetup DEBUG] Node ID '${instanceId}' already exists. SKIPPING.`);
      return true;
    }

    if (!this.registeredWorkletNamesRef.has(definition.audioWorkletProcessorName)) {
      console.log(`[AudioWorkletManager NodeSetup DEBUG] Worklet '${definition.audioWorkletProcessorName}' for '${definition.name}' not registered. Attempting registration...`);
      const regSuccess = await this.registerWorkletProcessor(definition.audioWorkletProcessorName, definition.audioWorkletCode);
      if (!regSuccess) {
        console.error(`[AudioWorkletManager NodeSetup DEBUG Critical] Failed to register '${definition.audioWorkletProcessorName}'. Cannot create node for ${instanceId}.`);
        this.setAudioInitializationError(`WorkletNode RegFail: ${definition.audioWorkletProcessorName}`);
        return false;
      }
      console.log(`[AudioWorkletManager NodeSetup DEBUG] Worklet '${definition.audioWorkletProcessorName}' registered successfully during setup for ${instanceId}.`);
    } else {
      console.log(`[AudioWorkletManager NodeSetup DEBUG] Worklet '${definition.audioWorkletProcessorName}' for '${definition.name}' (Instance: ${instanceId}) already registered.`);
    }

    try {
      // Step 1: Define paramDescriptors
      const paramDescriptors: Record<string, any> = {};
      definition.parameters.forEach(p => {
          if (p.type === 'slider' || p.type === 'knob' || p.type === 'number_input') {
              const initialVal = initialParams.find(ip => ip.id === p.id)?.currentValue;
              // Ensure defaultValue is used if initialVal is not a number, or provide a fallback like 0
              let valueToSet = 0;
              if (typeof initialVal === 'number') {
                  valueToSet = initialVal;
              } else if (typeof p.defaultValue === 'number') {
                  valueToSet = p.defaultValue;
              }
              paramDescriptors[p.id] = valueToSet;
          }
      });

      // Step 2: Define workletNodeOptions using paramDescriptors
      const workletNodeOptions: AudioWorkletNodeOptions = {
          processorOptions: {
              instanceId: instanceId,
              // Ensure this.audioContext is valid here; previous checks should guarantee it.
              // If this.audioContext can be null here due to some path, it needs to be handled.
              // However, the function should return early if audioContext is not 'running'.
              sampleRate: this.audioContext!.sampleRate, // Added non-null assertion based on prior checks
              ...(definition.id === OSCILLATOR_BLOCK_DEFINITION.id && {
                  waveform: initialParams.find(p => p.id === 'waveform')?.currentValue || OSCILLATOR_BLOCK_DEFINITION.parameters.find(p => p.id === 'waveform')?.defaultValue
              }),
              ...(definition.id === RULE_110_OSCILLATOR_BLOCK_DEFINITION.id && {
                  coreLength: initialParams.find(p => p.id === 'core_length')?.currentValue || RULE_110_OSCILLATOR_BLOCK_DEFINITION.parameters.find(p => p.id === 'core_length')?.defaultValue,
                  initialPattern: initialParams.find(p => p.id === 'initial_pattern_plus_boundaries')?.currentValue || RULE_110_OSCILLATOR_BLOCK_DEFINITION.parameters.find(p => p.id === 'initial_pattern_plus_boundaries')?.defaultValue,
                  outputMode: initialParams.find(p => p.id === 'output_mode')?.currentValue || RULE_110_OSCILLATOR_BLOCK_DEFINITION.parameters.find(p => p.id === 'output_mode')?.defaultValue,
              }),
              // Add other specific processorOptions as needed for other worklet types
          },
          parameterData: paramDescriptors,
      };

      // Step 3: Now it's safe to log workletNodeOptions
      console.log(`[AudioWorkletManager NodeSetup DEBUG] Preparing to create AudioWorkletNode for ${instanceId} with processor '${definition.audioWorkletProcessorName}'.`);
      console.log(`[AudioWorkletManager NodeSetup DEBUG] ProcessorOptions for ${instanceId}:`, JSON.stringify(workletNodeOptions.processorOptions, null, 2));
      console.log(`[AudioWorkletManager NodeSetup DEBUG] ParameterData for ${instanceId}:`, JSON.stringify(workletNodeOptions.parameterData, null, 2));

      // Step 4: Create the node
      const newNode = new AudioWorkletNode(this.audioContext!, definition.audioWorkletProcessorName, workletNodeOptions); // Added non-null assertion
      console.log(`[AudioWorkletManager NodeSetup DEBUG] AudioWorkletNode '${definition.audioWorkletProcessorName}' CREATED for '${instanceId}'.`);

      newNode.port.onmessage = (event) => {
        console.log(`[AudioWorkletManager] Message FROM Worklet (${instanceId}):`, event.data);
        // Existing logic for specific messages can go here, e.g. for requestSamplesFromWorklet
        // This basic logging will capture all messages.
      };

      let inputGainNodeForOutputBlock: GainNode | undefined = undefined;
      if (definition.id === AUDIO_OUTPUT_BLOCK_DEFINITION.id) {
        inputGainNodeForOutputBlock = this.audioContext!.createGain(); // Added non-null assertion
        const volumeParam = initialParams.find(p => p.id === 'volume');
        inputGainNodeForOutputBlock.gain.value = volumeParam ? Number(volumeParam.currentValue) : 0.7;
        inputGainNodeForOutputBlock.connect(newNode);
        console.log(`[AudioWorkletManager NodeSetup DEBUG] AudioOutput block '${instanceId}' internal gain node created and connected to worklet input. Initial gain: ${inputGainNodeForOutputBlock.gain.value}`);
      }

      this.managedWorkletNodesRef.set(instanceId, { node: newNode, definition, instanceId, inputGainNode: inputGainNodeForOutputBlock });
      console.log(`[AudioWorkletManager NodeSetup DEBUG] Successfully added node ${instanceId} to managedWorkletNodesRef. Map size: ${this.managedWorkletNodesRef.size}`);
      this.onStateChangeForReRender();
      return true;
    } catch (e: any) {
      const errMsg = `Failed to construct '${definition.audioWorkletProcessorName}' for '${instanceId}': ${e.message}`;
      console.error(`[AudioWorkletManager NodeSetup DEBUG Critical] ${errMsg}`, e);
      this.setAudioInitializationError(`WorkletNode Error: ${definition.audioWorkletProcessorName} - ${e.message.substring(0, 100)}`);
      return false;
    }
  }

  public updateManagedAudioWorkletNodeParams(instanceId: string, parameters: BlockParameter[]): void {
    if (!this.audioContext || this.audioContext.state !== 'running') return;
    const info = this.managedWorkletNodesRef.get(instanceId);
    if (!info) return;

    parameters.forEach(param => {
      const audioParam = info.node.parameters.get(param.id);
      if (audioParam && typeof param.currentValue === 'number') {
        if (info.definition.id === AUDIO_OUTPUT_BLOCK_DEFINITION.id && param.id === 'volume' && info.inputGainNode) {
          info.inputGainNode.gain.setTargetAtTime(param.currentValue, this.audioContext!.currentTime, 0.01); // Added non-null assertion
        } else {
          audioParam.setTargetAtTime(param.currentValue, this.audioContext!.currentTime, 0.01); // Added non-null assertion
        }
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
      this.removeManagedAudioWorkletNode(info.instanceId);
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
        // workletInfo.node.port.removeEventListener('message', messageListener); // This line is problematic if messageListener is not defined in this scope due to onmessage assignment
        reject(new Error(`Timeout waiting for samples from worklet ${instanceId} after ${timeoutMs}ms`));
      }, timeoutMs);

      const specificMessageListener = (event: MessageEvent) => {
        if (event.data?.type === 'RECENT_SAMPLES_DATA' && event.data.samples instanceof Float32Array) {
          clearTimeout(timeoutId);
          workletInfo.node.port.removeEventListener('message', specificMessageListener); // Remove this specific listener
          resolve(event.data.samples);
        }
        // Note: The generic onmessage handler added earlier will also log this.
        // If that's too noisy for this specific request, the generic handler could filter out RECENT_SAMPLES_DATA
        // or this specific listener could be made the *only* one temporarily for this operation,
        // which would require removing and then re-adding the generic listener.
        // For now, accepting that the generic log will also fire.
      };
      workletInfo.node.port.addEventListener('message', specificMessageListener);

      // Ensure the generic onmessage handler is not overwritten if it was set using addEventListener
      // If newNode.port.onmessage was assigned directly, this new addEventListener is fine.
      // If multiple distinct listeners are needed, always use addEventListener/removeEventListener.
      // The current change assigns .onmessage, so addEventListener here is for a *separate* listener.

      this.sendManagedAudioWorkletNodeMessage(instanceId, { type: 'GET_RECENT_SAMPLES' }); // Use the logging sender
    });
  }

  public getManagedNodesMap(): Map<string, ManagedWorkletNodeInfo> {
    return this.managedWorkletNodesRef;
  }
}
