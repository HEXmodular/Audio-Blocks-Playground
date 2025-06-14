import {
  BlockDefinition,
  BlockParameter,
  ManagedNativeNodeInfo,
  Scale as AppScale, // Renamed from 'Scale' to 'AppScale' as in constants/lyria.ts
} from '@interfaces/common';
import { CreatableNode } from '../native-blocks/CreatableNode';
import { createParameterDefinitions } from '../../constants/constants'; // Adjusted path

// Copied from constants/lyria.ts
const LYRIA_SCALE_OPTIONS = Object.entries(AppScale).map(([label, value]) => ({
  label: label.replace(/_/g, ' ').replace('SHARP', '#').replace('FLAT', 'b'), // Make it more readable
  value: value,
}));

export class LyriaMasterBlock implements CreatableNode {
  private audioContext: AudioContext | null = null;

  constructor(context: AudioContext) {
    this.audioContext = context;
  }

  setAudioContext(context: AudioContext | null): void {
    this.audioContext = context;
  }

  static getDefinition(): BlockDefinition {
    // Definition directly from LYRIA_MASTER_BLOCK_DEFINITION in constants/lyria.ts
    return {
      id: 'lyria-realtime-master-v1',
      name: 'Lyria Realtime Master',
      description: 'Generates music in real-time using Lyria. Audio output is handled by the integrated LiveMusicService.',
      runsAtAudioRate: true, // The service internally produces audio
      inputs: [
        // CV inputs for LiveMusicGenerationConfig
        { id: 'scale_cv_in', name: 'Scale CV', type: 'any', description: 'Modulates Lyria Scale (expects string matching GenAIScale value)' },
        { id: 'brightness_cv_in', name: 'Brightness CV', type: 'number', description: 'Modulates Lyria Brightness (0-1)' },
        { id: 'density_cv_in', name: 'Density CV', type: 'number', description: 'Modulates Lyria Density (0-1)' },
        { id: 'seed_cv_in', name: 'Seed CV', type: 'number', description: 'Modulates Lyria Seed (integer)' },
        { id: 'temperature_cv_in', name: 'Temperature CV', type: 'number', description: 'Modulates Lyria Temperature (e.g., 0.1-2.0)' },
        { id: 'guidance_cv_in', name: 'Guidance CV', type: 'number', description: 'Modulates Lyria Guidance Scale (e.g., 1-20)' },
        { id: 'top_k_cv_in', name: 'TopK CV', type: 'number', description: 'Modulates Lyria TopK (integer > 0)' },
        { id: 'bpm_cv_in', name: 'BPM CV', type: 'number', description: 'Modulates Lyria BPM (e.g. 60-180)' },

        // Control inputs
        { id: 'play_gate_in', name: 'Play Gate', type: 'gate', description: 'Gate for session.play() (high) / session.pause() (low)' },
        { id: 'stop_trigger_in', name: 'Stop Trigger', type: 'trigger', description: 'Trigger for session.stop() and reset' },
        { id: 'reconnect_trigger_in', name: 'Reconnect Trigger', type: 'trigger', description: 'Trigger to reconnect the Lyria session' },

        // Track muting inputs
        { id: 'mute_bass_gate_in', name: 'Mute Bass Gate', type: 'gate', description: 'Gate to mute bass track' },
        { id: 'mute_drums_gate_in', name: 'Mute Drums Gate', type: 'gate', description: 'Gate to mute drums track' },
        { id: 'only_bass_drums_gate_in', name: 'Only Bass & Drums Gate', type: 'gate', description: 'Gate to solo bass & drums' },

        // Prompt input
        { id: 'prompts_in', name: 'Prompts In', type: 'any', description: 'Array of Lyria WeightedPrompt objects [{text: string, weight: number}]' },
      ],
      outputs: [
        { id: 'audio_out', name: 'Audio Output', type: 'audio', description: 'Generated audio from Lyria LiveMusicService.' }
      ],
      parameters: createParameterDefinitions([
        { id: 'initial_prompt_text', name: 'Initial Prompt Text', type: 'text_input', defaultValue: 'cinematic lofi hip hop', description: 'Default text prompt for Lyria session.' },
        { id: 'initial_prompt_weight', name: 'Initial Prompt Weight', type: 'slider', min:0, max:1, step:0.01, defaultValue: 1.0, description: 'Weight for initial prompt.'},

        { id: 'scale', name: 'Scale', type: 'select', options: LYRIA_SCALE_OPTIONS, defaultValue: AppScale.C_MAJOR_A_MINOR, description: 'Lyria Scale. Overridden by CV if connected.' },
        { id: 'brightness', name: 'Brightness', type: 'slider', min:0, max:1, step:0.01, defaultValue: 0.5, description: 'Lyria Brightness (0-1). Overridden by CV.' },
        { id: 'density', name: 'Density', type: 'slider', min:0, max:1, step:0.01, defaultValue: 0.5, description: 'Lyria Density (0-1). Overridden by CV.' },
        { id: 'seed', name: 'Seed', type: 'number_input', defaultValue: 0, description: 'Lyria Seed (0 for random date-based). Overridden by CV.' }, // 0 can mean auto/date-based
        { id: 'temperature', name: 'Temperature', type: 'slider', min: 0.1, max: 2, step: 0.01, defaultValue: 1.1, description: 'Lyria Temperature. Overridden by CV.' },
        { id: 'guidance_scale', name: 'Guidance Scale', type: 'slider', min: 1, max: 20, step: 0.1, defaultValue: 7.0, description: 'Lyria Guidance Scale. Overridden by CV.' },
        { id: 'top_k', name: 'Top K', type: 'number_input', min:1, max:100, step:1, defaultValue: 40, description: 'Lyria Top K. Overridden by CV.' },
        { id: 'bpm', name: 'BPM', type: 'number_input', min:30, max:240, step:1, defaultValue: 120, description: 'Lyria BPM. Overridden by CV.' },
      ]),
      logicCode: `
// Lyria Realtime Master - Main Thread Logic
let newInternalState = { ...internalState };

// --- Handle Config Parameter Changes (CV overrides params) ---
const configChanged =
    params.scale !== internalState.lastScale ||
    params.brightness !== internalState.lastBrightness ||
    params.density !== internalState.lastDensity ||
    params.seed !== internalState.lastSeed ||
    params.temperature !== internalState.lastTemperature ||
    params.guidance_scale !== internalState.lastGuidanceScale ||
    params.top_k !== internalState.lastTopK ||
    params.bpm !== internalState.lastBpm ||
    inputs.scale_cv_in !== internalState.lastScaleCv ||
    inputs.brightness_cv_in !== internalState.lastBrightnessCv ||
    inputs.density_cv_in !== internalState.lastDensityCv ||
    inputs.seed_cv_in !== internalState.lastSeedCv ||
    inputs.temperature_cv_in !== internalState.lastTemperatureCv ||
    inputs.guidance_cv_in !== internalState.lastGuidanceCv ||
    inputs.top_k_cv_in !== internalState.lastTopKCv ||
    inputs.bpm_cv_in !== internalState.lastBpmCv;

if (configChanged) {
    newInternalState.configUpdateNeeded = true;
    newInternalState.lastScale = params.scale;
    newInternalState.lastBrightness = params.brightness;
    newInternalState.lastDensity = params.density;
    newInternalState.lastSeed = params.seed;
    newInternalState.lastTemperature = params.temperature;
    newInternalState.lastGuidanceScale = params.guidance_scale;
    newInternalState.lastTopK = params.top_k;
    newInternalState.lastBpm = params.bpm;
    newInternalState.lastScaleCv = inputs.scale_cv_in;
    newInternalState.lastBrightnessCv = inputs.brightness_cv_in;
    newInternalState.lastDensityCv = inputs.density_cv_in;
    newInternalState.lastSeedCv = inputs.seed_cv_in;
    newInternalState.lastTemperatureCv = inputs.temperature_cv_in;
    newInternalState.lastGuidanceCv = inputs.guidance_cv_in;
    newInternalState.lastTopKCv = inputs.top_k_cv_in;
    newInternalState.lastBpmCv = inputs.bpm_cv_in;
    __custom_block_logger__("Lyria config params or CV changed. Flagging for update.");
}


// --- Handle Prompts ---
const promptsInput = inputs.prompts_in;
const initialPromptText = params.initial_prompt_text;
const initialPromptWeight = params.initial_prompt_weight;
let effectivePrompts = [];
if (promptsInput && Array.isArray(promptsInput) && promptsInput.length > 0) {
    effectivePrompts = promptsInput.filter(p => p && typeof p.text === 'string' && typeof p.weight === 'number');
} else if (initialPromptText && initialPromptText.trim() !== "") {
    effectivePrompts = [{ text: initialPromptText.trim(), weight: initialPromptWeight }];
}
if (JSON.stringify(effectivePrompts) !== JSON.stringify(internalState.lastEffectivePrompts)) {
    newInternalState.promptsUpdateNeeded = true;
    newInternalState.lastEffectivePrompts = effectivePrompts;
     __custom_block_logger__(\`Lyria prompts changed. Flagging for update. Num prompts: \${effectivePrompts.length}\`);
}

// --- Handle Play/Pause/Stop/Reconnect/Restart ---
// internalState.isPlaying is updated by App.tsx based on service feedback
// internalState.wasPausedDueToGateLow helps gate logic avoid re-triggering play if already playing.

const playGate = !!inputs.play_gate_in;
const stopTrigger = inputs.stop_trigger_in;
const reconnectTrigger = inputs.reconnect_trigger_in;
const UIRestartRequest = internalState.restartRequest;

if (UIRestartRequest) {
    newInternalState.stopRequest = true;
    newInternalState.playRequest = true;
    newInternalState.pauseRequest = false;
    newInternalState.restartRequest = false; // Consume UI request
    newInternalState.wasPausedDueToGateLow = false; // Reset this on restart
    __custom_block_logger__("UI Restart triggered. Requesting stop then play.");
} else if (stopTrigger && (internalState.prevStopTrigger === false || internalState.prevStopTrigger === undefined)) {
    newInternalState.stopRequest = true;
    newInternalState.playRequest = false;
    newInternalState.pauseRequest = false;
    newInternalState.wasPausedDueToGateLow = false; // Reset this on stop
    __custom_block_logger__("Stop trigger received. Requesting stop.");
} else if (playGate) {
    if (!internalState.isPlaying || internalState.wasPausedDueToGateLow) {
        newInternalState.playRequest = true;
        newInternalState.pauseRequest = false;
        newInternalState.wasPausedDueToGateLow = false;
        __custom_block_logger__("Play gate high. Requesting play.");
    }
} else { // Play gate is low
    if (internalState.isPlaying && !newInternalState.stopRequest && !newInternalState.playRequest) { // Only pause if playing and no other command active
        newInternalState.pauseRequest = true;
        newInternalState.playRequest = false;
        newInternalState.wasPausedDueToGateLow = true;
        __custom_block_logger__("Play gate low. Requesting pause.");
    }
}
newInternalState.prevStopTrigger = stopTrigger;

if (reconnectTrigger && (internalState.prevReconnectTrigger === false || internalState.prevReconnectTrigger === undefined)) {
    newInternalState.reconnectRequest = true;
    __custom_block_logger__("Reconnect trigger received. Requesting reconnect.");
}
newInternalState.prevReconnectTrigger = reconnectTrigger;


// --- Handle Track Muting ---
const muteBassGate = !!inputs.mute_bass_gate_in;
const muteDrumsGate = !!inputs.mute_drums_gate_in;
const onlyBassDrumsGate = !!inputs.only_bass_drums_gate_in;
if (muteBassGate !== internalState.lastMuteBass ||
    muteDrumsGate !== internalState.lastMuteDrums ||
    onlyBassDrumsGate !== internalState.lastOnlyBassDrums) {
    newInternalState.trackMuteUpdateNeeded = true;
    newInternalState.lastMuteBass = muteBassGate;
    newInternalState.lastMuteDrums = muteDrumsGate;
    newInternalState.lastOnlyBassDrums = onlyBassDrumsGate;
    __custom_block_logger__(\`Track mute states changed. Bass: \${muteBassGate}, Drums: \${muteDrumsGate}, OnlyBassDrums: \${onlyBassDrumsGate}\`);
}

return newInternalState;
  `.trim(),
      initialPrompt: 'Create a Lyria Realtime Master block that interfaces with the LiveMusicService. It should manage playback (play, pause, stop, reconnect), prompts, and various music generation parameters (scale, brightness, density, seed, temperature, guidance, top_k, bpm) via inputs and parameters. Also include track muting controls (muteBass, muteDrums, onlyBassAndDrums). The block itself does not generate audio worklet code; it controls the service.',
      maxInstances: 1, // Typically, there's only one master output for Lyria service
    } as BlockDefinition;
  }

  createNode(
    instanceId: string,
    definition: BlockDefinition,
    _initialParams: BlockParameter[] // initialParams are available if needed, underscore if not used
  ): ManagedNativeNodeInfo {
    if (!this.audioContext) {
      throw new Error('AudioContext not set for LyriaMasterBlock');
    }

    // Create a placeholder GainNode as the main audio node.
    // The actual audio will be routed from LiveMusicService to the global output
    // by the AudioGraphConnectorService, not directly through this block's audio node.
    const placeholderNode = this.audioContext.createGain();
    placeholderNode.gain.value = 0; // Ensure it doesn't output sound itself

    const nodeInfo: ManagedNativeNodeInfo = {
      instanceId,
      definition,
      node: placeholderNode,
      nodeForInputConnections: null, // Inputs are CV/gate/trigger, not direct audio to this node
      nodeForOutputConnections: placeholderNode, // Output is technically from the service
      mainProcessingNode: placeholderNode,
      paramTargetsForCv: new Map(), // Parameters are handled by logicCode / LiveMusicService
    };

    // this.updateNodeParams(nodeInfo, initialParams); // Not strictly necessary if params handled by service
    return nodeInfo;
  }

  updateNodeParams(
    nodeInfo: ManagedNativeNodeInfo,
    parameters: BlockParameter[]
  ): void {
    // Most parameters are consumed by the logicCode and then affect the LiveMusicService.
    // Direct manipulation of an AudioNode's AudioParams is not the primary mechanism here.
    // This method could be used for parameters that directly control a placeholder node if needed,
    // but for LyriaMaster, it's likely minimal.
    // For example, if there was a "master volume" for the placeholder that wasn't part of LyriaService:
    // const gainNode = nodeInfo.node as GainNode;
    // parameters.forEach(param => {
    //   if (param.id === 'masterVolumePlaceholder' && gainNode.gain) {
    //     gainNode.gain.setValueAtTime(param.currentValue as number, this.audioContext?.currentTime ?? 0);
    //   }
    // });
    console.log('LyriaMasterBlock.updateNodeParams called. Parameters:', parameters, 'NodeInfo:', nodeInfo);
  }

  connect(): void {
    console.warn(
      "LyriaMasterBlock: 'connect' method is not implemented. Connections are managed by AudioGraphConnectorService based on block type."
    );
  }

  disconnect(): void {
    console.warn(
      "LyriaMasterBlock: 'disconnect' method is not implemented. Disconnections are managed by AudioGraphConnectorService."
    );
  }
}
