import {
  BlockDefinition,
  BlockParameter,
  ManagedNativeNodeInfo,
  Scale as AppScale, // Renamed from 'Scale' to 'AppScale' as in constants/lyria.ts
} from '@interfaces/common';
import { CreatableNode } from '../native-blocks/CreatableNode';
import { createParameterDefinitions } from '../../constants/constants'; // Adjusted path
import { LiveMusicService, DEFAULT_MUSIC_GENERATION_CONFIG, type LiveMusicServiceCallbacks, PlaybackState, type WeightedPrompt, type LiveMusicGenerationConfig } from '@services/LiveMusicService';
// Add Scale from LiveMusicService if it's different from AppScale and needed for config
import { Scale as LyriaScale } from '@services/LiveMusicService'; // Assuming GenAIScale might be mapped to LyriaScale


// Copied from constants/lyria.ts
const LYRIA_SCALE_OPTIONS = Object.entries(AppScale).map(([label, value]) => ({
  label: label.replace(/_/g, ' ').replace('SHARP', '#').replace('FLAT', 'b'), // Make it more readable
  value: value,
}));

export class LyriaMasterBlock implements CreatableNode {
  private audioContext: AudioContext | null = null;
  private liveMusicService: LiveMusicService | null = null;
  private prevParams: Record<string, any> = {};
  private prevInputs: Record<string, any> = {};
  private prevEffectivePrompts: WeightedPrompt[] = [];
  // To store the AudioBufferSourceNodes for active playback (will be used in step 4)
  private activeSources: AudioBufferSourceNode[] = [];
  // To queue incoming audio data from the service (will be used in step 4)
  private audioBufferQueue: { buffer: AudioBuffer, bpm: number }[] = [];
  // To manage playback timing (will be used in step 4)
  private nextBufferStartTime: number = 0;
  private readonly serviceBufferTimeSec = 2; // Corresponds to bufferTime in LiveMusicService for initial scheduling

  private outputGainNode: GainNode | null = null; // To store the block's main output node
  private isPlayingAudio: boolean = false; // Flag to control the scheduling loop
  private schedulerIntervalId: NodeJS.Timeout | null = null; // To store setInterval ID
  private readonly SCHEDULING_INTERVAL_MS = 50; // How often to check the queue

  constructor(context: AudioContext) {
    this.audioContext = context;
  }

  // setAudioContext(context: AudioContext | null): void {
  //   this.audioContext = context;
  // }

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
        { id: 'initial_prompt_weight', name: 'Initial Prompt Weight', type: 'slider', min: 0, max: 1, step: 0.01, defaultValue: 1.0, description: 'Weight for initial prompt.' },

        { id: 'scale', name: 'Scale', type: 'select', options: LYRIA_SCALE_OPTIONS, defaultValue: AppScale.C_MAJOR_A_MINOR, description: 'Lyria Scale. Overridden by CV if connected.' },
        { id: 'brightness', name: 'Brightness', type: 'slider', min: 0, max: 1, step: 0.01, defaultValue: 0.5, description: 'Lyria Brightness (0-1). Overridden by CV.' },
        { id: 'density', name: 'Density', type: 'slider', min: 0, max: 1, step: 0.01, defaultValue: 0.5, description: 'Lyria Density (0-1). Overridden by CV.' },
        { id: 'seed', name: 'Seed', type: 'number_input', defaultValue: 0, description: 'Lyria Seed (0 for random date-based). Overridden by CV.' }, // 0 can mean auto/date-based
        { id: 'temperature', name: 'Temperature', type: 'slider', min: 0.1, max: 2, step: 0.01, defaultValue: 1.1, description: 'Lyria Temperature. Overridden by CV.' },
        { id: 'guidance_scale', name: 'Guidance Scale', type: 'slider', min: 1, max: 20, step: 0.1, defaultValue: 7.0, description: 'Lyria Guidance Scale. Overridden by CV.' },
        { id: 'top_k', name: 'Top K', type: 'number_input', min: 1, max: 100, step: 1, defaultValue: 40, description: 'Lyria Top K. Overridden by CV.' },
        { id: 'bpm', name: 'BPM', type: 'number_input', min: 30, max: 240, step: 1, defaultValue: 120, description: 'Lyria BPM. Overridden by CV.' },
      ]),
      // initialPrompt has been removed as the block's logic is now in TypeScript.
      maxInstances: 1, // Typically, there's only one master output for Lyria service
    } as BlockDefinition;
  }

  createNode(
    instanceId: string,
    definition: BlockDefinition,
    _initialParams: BlockParameter[] // initialParams are available if needed, underscore if not used
  ): ManagedNativeNodeInfo {
    console.log(`👩‍🦳 [LyriaMasterBlock ${instanceId}] Creating Node`);

    if (!this.audioContext) {
      throw new Error('👩‍🦳 [LyriaMasterBlock] AudioContext not set');
    }

    // Create a placeholder GainNode as the main audio node.
    // The actual audio will be routed from LiveMusicService to the global output
    // by the AudioGraphConnectorService, not directly through this block's audio node.
    const placeholderNode = this.audioContext.createGain();
    // placeholderNode.gain.value = 0; // Ensure it doesn't output sound itself
    this.outputGainNode = placeholderNode;

    if (!this.audioContext) { console.error('👩‍🦳 [LyriaMasterBlock]: AudioContext not available during createNode.'); throw new Error('AudioContext not available for LyriaMasterBlock'); }
    const apiKey = process.env.API_KEY;
    if (!apiKey) { console.error('👩‍🦳 [LyriaMasterBlock]: API_KEY not found in environment variables.'); }

    const callbacks: LiveMusicServiceCallbacks = {
      onPlaybackStateChange: (newState: PlaybackState) => {
        console.log(`👩‍🦳 [LyriaMasterBlock ${instanceId}] Playback state: ${newState}`);
        this.isPlayingAudio = this.liveMusicService?.getPlaybackState() === PlaybackState.PLAYING;
        // TODO: Update internal block state if necessary for UI feedback
      },
      onFilteredPrompt: (promptInfo: { text: string; filteredReason: string }) => {
        console.log(`👩‍🦳 [LyriaMasterBlock ${instanceId}] Filtered prompt: "${promptInfo.text}", Reason: ${promptInfo.filteredReason}`);
      },
      onSetupComplete: () => {
        console.log(`👩‍🦳 [LyriaMasterBlock ${instanceId}] LiveMusicService setup complete and ready.`);
      },
      onError: (error: string) => {
        console.error(`👩‍🦳 [LyriaMasterBlock ${instanceId}] LiveMusicService Error: ${error}`);
      },
      onClose: (message: string) => {
        console.log(`👩‍🦳 [LyriaMasterBlock ${instanceId}] LiveMusicService closed: ${message}`);
      },
      onOutputNodeChanged: (newNode: AudioNode) => {
        console.log(`👩‍🦳 [LyriaMasterBlock ${instanceId}] LiveMusicService internal output node changed. This block will manage its own output.`, newNode);
        // If LyriaMasterBlock is to use its own AudioBufferSourceNodes connected to its 'audio_out',
        // this callback might just be for logging or specific advanced scenarios.
        // The service's internal output node might not be directly used by LyriaMasterBlock's main output path.
      },
      onAudioBufferProcessed: ((buffer: AudioBuffer, bpm: number) => {
        // console.log(`[LyriaMasterBlock ${instanceId}] Audio buffer received for processing. Duration: ${buffer.duration}, BPM: ${bpm}`, this.isPlayingAudio);
        if (!this.audioContext) return;

        this.audioBufferQueue.push({ buffer, bpm });

        // const currentServiceState = this.liveMusicService?.getPlaybackState();
        // If playback is active and the queue was empty, we might want to kickstart scheduling immediately
        // rather than waiting for the next interval, but the interval should handle it.
        if (this.isPlayingAudio && !this.schedulerIntervalId) {
          console.warn(`👩‍🦳 [LyriaMasterBlock ${instanceId}] isPlayingAudio is true but scheduler not running. This shouldn't happen if logic is correct.`,this);
          this.startScheduler(instanceId); // Potentially start if it's found to be stopped erroneously
        }
      })
    };

    this.isPlayingAudio = false; // Initialize playback state

    if (apiKey && this.audioContext) {
      const initialServiceConfig: Partial<LiveMusicGenerationConfig> = {
        ...DEFAULT_MUSIC_GENERATION_CONFIG,
      };
      _initialParams.forEach(param => {
        if (param.id === 'bpm' && param.currentValue !== undefined) {
          initialServiceConfig.bpm = param.currentValue as number;
        }
        if (param.id === 'scale' && param.currentValue !== undefined) {
          const scaleValue = param.currentValue as string;
          // Validate that scaleValue is a valid string member of the LyriaScale enum
          if (Object.values(LyriaScale).some(validScale => validScale === scaleValue)) {
            initialServiceConfig.scale = scaleValue as any; // Force assignment
          } else {
            console.warn(`👩‍🦳 [LyriaMasterBlock createNode] Invalid initial scale value: ${scaleValue}`);
          }
        }
        // Add other relevant initial parameters
      });

      this.liveMusicService = LiveMusicService.getInstance(apiKey, this.audioContext, callbacks, initialServiceConfig);

      this.liveMusicService.connect()
        .then(() => {
          console.log(`👩‍🦳 [LyriaMasterBlock ${instanceId}] LiveMusicService connect() initiated.`);
          // If there's an initial prompt from parameters, set it after connection.
          const initialPromptTextParam = _initialParams.find(p => p.id === 'initial_prompt_text');
          const initialPromptWeightParam = _initialParams.find(p => p.id === 'initial_prompt_weight');
          let initialPrompts: WeightedPrompt[] = [];
          if (initialPromptTextParam && initialPromptTextParam.currentValue) {
            initialPrompts = [{
              text: initialPromptTextParam.currentValue as string,
              weight: (initialPromptWeightParam?.currentValue as number) ?? 1.0
            }];
            return this.liveMusicService?.setWeightedPrompts(initialPrompts);
          }
          this.prevEffectivePrompts = JSON.parse(JSON.stringify(initialPrompts)); // Initialize prevEffectivePrompts
        })
        .then(() => {
          console.log(`👩‍🦳 [LyriaMasterBlock] LiveMusicService promt setted.`);
          this.liveMusicService?.play();
        })
        .catch(error => {
          console.error(`👩‍🦳 [LyriaMasterBlock ${instanceId}] Failed to connect LiveMusicService:`, error);
        });
    } else {
      console.warn(`👩‍🦳 [LyriaMasterBlock ${instanceId}] LiveMusicService could not be initialized due to missing API key or AudioContext.`);
    }

    const nodeInfo: ManagedNativeNodeInfo = {
      instanceId,
      definition,
      node: placeholderNode,
      nodeForInputConnections: null, // Inputs are CV/gate/trigger, not direct audio to this node
      nodeForOutputConnections: placeholderNode, // Output is technically from the service
      mainProcessingNode: placeholderNode,
      paramTargetsForCv: new Map(), // Parameters are handled by logicCode / LiveMusicService
    };

    // Initialize prevParams and prevInputs
    _initialParams.forEach(param => {
      this.prevParams[param.id] = param.currentValue;
    });
    this.prevInputs = {};

    // this.updateNodeParams(nodeInfo, initialParams); // Not strictly necessary if params handled by service
    return nodeInfo;
  }

  public updateNodeParams(
    nodeInfo: ManagedNativeNodeInfo,
    parameters: BlockParameter[],
    currentInputs?: Record<string, any>
  ): void {
    // instanceId parameter removed as nodeInfo.instanceId is used
    if (!this.liveMusicService || !this.audioContext) {
      console.warn(`👩‍🦳 [LyriaMasterBlock ${nodeInfo.instanceId}] LiveMusicService or AudioContext not available in updateNodeParams.`);
      return;
    }

    const currentParamsMap = new Map(parameters.map(p => [p.id, p.currentValue]));

    this.handleConfigurationChanges(nodeInfo.instanceId, currentParamsMap, currentInputs);
    this.handlePromptChanges(nodeInfo.instanceId, currentParamsMap, currentInputs);
    this.handlePlaybackControl(nodeInfo.instanceId, currentInputs);
    this.handleTrackMuting(nodeInfo.instanceId, currentInputs);

    // Store current values for future change detection
    this.prevParams = Object.fromEntries(currentParamsMap);
    if (currentInputs) {
      this.prevInputs = { ...currentInputs };
    } else {
      this.prevInputs = {};
    }
  }

  private handleConfigurationChanges(
    instanceId: string,
    currentParams: Map<string, any>,
    currentInputs?: Record<string, any>
  ): void {
    if (!this.liveMusicService) return;

    const newConfig: Partial<LiveMusicGenerationConfig> = {};
    let configChanged = false;

    const paramIds: (keyof LiveMusicGenerationConfig)[] = ['scale', 'brightness', 'density', 'seed', 'temperature', 'guidance', 'topK', 'bpm'];
    const paramToCvInputMap: Record<string, string> = {
      scale: 'scale_cv_in',
      brightness: 'brightness_cv_in',
      density: 'density_cv_in',
      seed: 'seed_cv_in',
      temperature: 'temperature_cv_in',
      guidance: 'guidance_cv_in', // Note: param is 'guidance_scale', service field is 'guidance'
      topK: 'top_k_cv_in',       // Note: param is 'top_k', service field is 'topK'
      bpm: 'bpm_cv_in',
    };
    const internalParamNameMap: Record<string, string> = {
      guidance: 'guidance_scale',
      topK: 'top_k',
    };


    for (const serviceKey of paramIds) {
      const cvInputKey = paramToCvInputMap[serviceKey as string];
      const blockParamKey = internalParamNameMap[serviceKey as string] || (serviceKey as string);

      const cvValue = currentInputs?.[cvInputKey];
      const paramValue = currentParams.get(blockParamKey);

      let valueToSet: any = undefined;
      let valueSource: 'cv' | 'param' | 'none' = 'none';

      if (cvValue !== undefined && cvValue !== null) {
        valueToSet = cvValue;
        valueSource = 'cv';
      } else if (paramValue !== undefined) {
        valueToSet = paramValue;
        valueSource = 'param';
      }

      if (valueSource !== 'none') {
        // Type conversions and specific logic
        if (serviceKey === 'scale') {
          const scaleStringValue = String(valueToSet);
          if (Object.values(LyriaScale).some(validScale => validScale === scaleStringValue)) {
            newConfig.scale = scaleStringValue as LyriaScale | undefined; // Allow undefined
          } else {
            // console.warn(`[LyriaMasterBlock ${instanceId}] Invalid scale value: ${valueToSet}`);
          }
        } else if (serviceKey === 'seed') {
          const numSeed = Math.floor(Number(valueToSet));
          if (valueSource === 'param' && numSeed === 0) {
            newConfig.seed = undefined; // 0 for param means auto/date-based
          } else if (!Number.isNaN(numSeed)) {
            newConfig.seed = numSeed;
          } else {
            newConfig.seed = undefined; // Invalid number results in undefined
          }
        } else if (serviceKey === 'topK' || serviceKey === 'bpm') {
          const numVal = Math.floor(Number(valueToSet));
          if (!Number.isNaN(numVal)) {
            newConfig[serviceKey as keyof LiveMusicGenerationConfig] = numVal as any;
          } else {
            newConfig[serviceKey as keyof LiveMusicGenerationConfig] = undefined;
          }
        } else if (['brightness', 'density', 'temperature', 'guidance'].includes(serviceKey)) {
          const numVal = Number(valueToSet);
          if (!Number.isNaN(numVal)) {
            newConfig[serviceKey as keyof LiveMusicGenerationConfig] = numVal as any;
          } else {
            newConfig[serviceKey as keyof LiveMusicGenerationConfig] = undefined;
          }
        }
      }

      // Check for actual change from previous state for this specific key
      const prevCvValue = this.prevInputs?.[cvInputKey];
      const prevParamValue = this.prevParams?.[blockParamKey];
      let effectiveOldValue = (prevCvValue !== undefined && prevCvValue !== null) ? prevCvValue : prevParamValue;
      if (serviceKey === 'seed' && valueSource === 'param' && Number(paramValue) === 0 && (prevCvValue === undefined || prevCvValue === null) && Number(this.prevParams?.[blockParamKey]) === 0) {
        // If current and previous seed param were 0 (auto), and no CV, it's not a change for 'undefined'
      } else if (serviceKey === 'scale' && !Object.values(LyriaScale).includes(valueToSet as LyriaScale)) {
        // Don't consider invalid scale as a change that triggers update if the underlying value didn't change
        if (valueToSet !== effectiveOldValue) configChanged = true; // It's different, but won't be sent
      }
      else if (newConfig[serviceKey] !== undefined && newConfig[serviceKey] !== effectiveOldValue) {
        // A bit complex to check if newConfig[serviceKey] is truly different from effectiveOldValue
        // due to type coercions. A simpler check: if valueToSet is different from effectiveOldValue.
        if (valueToSet !== effectiveOldValue) {
          configChanged = true;
        }
      } else if (newConfig[serviceKey] === undefined && effectiveOldValue !== undefined && serviceKey === 'seed' && valueSource === 'param' && Number(paramValue) === 0) {
        // Change from a specific seed to auto seed
        configChanged = true;
      } else if (newConfig[serviceKey] !== undefined && effectiveOldValue === undefined) {
        // Change from no value to a value
        configChanged = true;
      }
    }

    if (configChanged) {
      console.log(`👩‍🦳 [LyriaMasterBlock ${instanceId}] Configuration changed. Sending updates to LiveMusicService:`, newConfig);
      this.liveMusicService.setMusicGenerationConfig(newConfig);
    }
  }

  private handlePromptChanges(
    instanceId: string,
    currentParams: Map<string, any>,
    currentInputs?: Record<string, any>
  ): void {
    if (!this.liveMusicService) return;

    const promptsInput = currentInputs?.prompts_in;
    const initialPromptText = currentParams.get('initial_prompt_text') as string | undefined;
    const initialPromptWeight = currentParams.get('initial_prompt_weight') as number | undefined ?? 1.0;

    let effectivePrompts: WeightedPrompt[] = [];

    if (promptsInput && Array.isArray(promptsInput) && promptsInput.length > 0) {
      effectivePrompts = promptsInput.filter(
        p => p && typeof p.text === 'string' && typeof p.weight === 'number'
      ) as WeightedPrompt[];
    } else if (initialPromptText && initialPromptText.trim() !== "") {
      effectivePrompts = [{ text: initialPromptText.trim(), weight: initialPromptWeight }];
    }

    // Compare with previous prompts
    // JSON.stringify is a common way for deep comparison of simple objects if order doesn't matter
    // or if the source guarantees order for arrays of prompts.
    // For more robust comparison, a deep-equal function might be better,
    // but this matches the original logicCode's apparent intent.
    if (JSON.stringify(effectivePrompts) !== JSON.stringify(this.prevEffectivePrompts)) {
      console.log(`👩‍🦳 [LyriaMasterBlock ${instanceId}] Prompts changed. Sending update to LiveMusicService. Prompts:`, effectivePrompts);
      this.liveMusicService.setWeightedPrompts(effectivePrompts);
      this.prevEffectivePrompts = JSON.parse(JSON.stringify(effectivePrompts)); // Store a deep copy
    }
  }

  private handlePlaybackControl(
    instanceId: string,
    currentInputs?: Record<string, any>
  ): void {
    if (!this.liveMusicService) return;

    const playGate = !!currentInputs?.play_gate_in;
    const stopTrigger = !!currentInputs?.stop_trigger_in;
    const reconnectTrigger = !!currentInputs?.reconnect_trigger_in;

    // const prevPlayGate = !!this.prevInputs?.play_gate_in; // Unused, remove
    const prevStopTrigger = !!this.prevInputs?.stop_trigger_in;
    const prevReconnectTrigger = !!this.prevInputs?.reconnect_trigger_in;

    const currentServiceState = this.liveMusicService.getPlaybackState();
    // Stop Trigger (on rising edge)
    if (stopTrigger && !prevStopTrigger) {
      console.log(`👩‍🦳 [LyriaMasterBlock ${instanceId}] Stop trigger activated.`);
      this.liveMusicService.stop();
      this.isPlayingAudio = false;
      this.stopScheduler(instanceId, true); // Clear audio on stop
      return;
    }

    // Reconnect Trigger (on rising edge)
    if (reconnectTrigger && !prevReconnectTrigger) {
      console.log(`👩‍🦳 [LyriaMasterBlock ${instanceId}] Reconnect trigger activated.`);
      this.isPlayingAudio = false; // Stop current playback before reconnect
      this.stopScheduler(instanceId, true);
      this.liveMusicService.reconnect();
      // Consider if isPlayingAudio should be true after reconnect automatically or wait for new play command
      return;
    }

    // Play Gate Logic
    if (playGate) {
      if (!this.isPlayingAudio || currentServiceState === PlaybackState.PAUSED || currentServiceState === PlaybackState.STOPPED) {
        console.log(`👩‍🦳 [LyriaMasterBlock ${instanceId}] Play gate high. Current state: ${currentServiceState}, isPlayingAudio: ${this.isPlayingAudio}. Requesting play.`);
        if (currentServiceState === PlaybackState.STOPPED) { // If service was fully stopped, reset internal buffer time
          this.nextBufferStartTime = 0; // Will be re-initialized in schedulePlayback
        }
        this.liveMusicService.play(this.prevEffectivePrompts);
        this.isPlayingAudio = true;
        this.startScheduler(instanceId);
      }
    } else { // Play Gate is low
      if (this.isPlayingAudio && (currentServiceState === PlaybackState.PLAYING || currentServiceState === PlaybackState.LOADING)) {
        console.log(`👩‍🦳 [LyriaMasterBlock ${instanceId}] Play gate low. Current state: ${currentServiceState}, isPlayingAudio: ${this.isPlayingAudio}. Requesting pause.`);
        this.liveMusicService.pause();
        this.isPlayingAudio = false;
        this.stopScheduler(instanceId, false); // Don't clear audio on pause
      }
    }
  }

  private handleTrackMuting(
    instanceId: string,
    currentInputs?: Record<string, any>
  ): void {
    if (!this.liveMusicService) return;

    const muteBassGate = !!currentInputs?.mute_bass_gate_in;
    const muteDrumsGate = !!currentInputs?.mute_drums_gate_in;
    const onlyBassDrumsGate = !!currentInputs?.only_bass_drums_gate_in;

    const prevMuteBassGate = !!this.prevInputs?.mute_bass_gate_in;
    const prevMuteDrumsGate = !!this.prevInputs?.mute_drums_gate_in;
    const prevOnlyBassDrumsGate = !!this.prevInputs?.only_bass_drums_gate_in;

    let trackMuteConfigChanged = false;
    if (muteBassGate !== prevMuteBassGate ||
      muteDrumsGate !== prevMuteDrumsGate ||
      onlyBassDrumsGate !== prevOnlyBassDrumsGate) {
      trackMuteConfigChanged = true;
    }

    if (trackMuteConfigChanged) {
      const newMuteConfig: Partial<LiveMusicGenerationConfig> = {
        muteBass: muteBassGate,
        muteDrums: muteDrumsGate,
        onlyBassAndDrums: onlyBassDrumsGate, // Note: Service property name is onlyBassAndDrums
      };
      console.log(`👩‍🦳 [LyriaMasterBlock ${instanceId}] Track mute states changed. Sending update:`, newMuteConfig);
      this.liveMusicService.setMusicGenerationConfig(newMuteConfig);
    }
  }

  private schedulePlayback(): void {
    if (!this.audioContext || !this.outputGainNode || !this.isPlayingAudio) {
      if (!this.isPlayingAudio && this.schedulerIntervalId) {
        // If not supposed to be playing, ensure interval is cleared
        clearInterval(this.schedulerIntervalId);
        this.schedulerIntervalId = null;
      }
      return;
    }

    const currentTime = this.audioContext.currentTime;

    // Initialize nextBufferStartTime if it's the very beginning of playback
    if (this.nextBufferStartTime === 0 && this.audioBufferQueue.length > 0) {
      this.nextBufferStartTime = currentTime + this.serviceBufferTimeSec;
      console.log(`👩‍🦳 [LyriaMasterBlock ${this.audioContext.sampleRate}] Initializing playback. First buffer to start at: ${this.nextBufferStartTime.toFixed(3)} (current: ${currentTime.toFixed(3)})`);
    }

    // Process buffers that should be scheduled by now
    while (this.audioBufferQueue.length > 0 && this.nextBufferStartTime <= currentTime + this.serviceBufferTimeSec + 1.0) { // Schedule a bit ahead
      // Buffer underrun check (more accurately, if we've fallen behind)
      if (this.nextBufferStartTime < currentTime - 0.1) { // Allow small discrepancies
        console.warn(`👩‍🦳 [LyriaMasterBlock ${this.audioContext.sampleRate}] Buffer underrun or significant scheduling lag. Resetting buffer time. Next expected: ${this.nextBufferStartTime.toFixed(3)}, Current: ${currentTime.toFixed(3)}`);
        // Clear only future active sources? Or all? For now, let existing ones play out if already started.
        this.nextBufferStartTime = currentTime + this.serviceBufferTimeSec;
        // Consider clearing queue or part of it if lag is too much? For now, try to catch up.
      }

      const audioItem = this.audioBufferQueue.shift();
      if (!audioItem) continue;

      const source = this.audioContext.createBufferSource();
      source.buffer = audioItem.buffer;
      source.connect(this.outputGainNode);

      // console.log("source.start");
      source.start(this.nextBufferStartTime);
      // console.log(`[LyriaMasterBlock] Scheduled audio chunk to play at ${this.nextBufferStartTime.toFixed(3)}. Duration: ${audioItem.buffer.duration.toFixed(3)}`);

      this.nextBufferStartTime += audioItem.buffer.duration;

      // this.activeSources.push(source);
      // source.onended = () => {
      //   this.activeSources = this.activeSources.filter(s => s !== source);
      //   source.disconnect();
      // };
    }
  }

  private startScheduler(instanceId: string): void {
    if (this.schedulerIntervalId === null) {
      this.schedulePlayback(); // Run once immediately
      this.schedulerIntervalId = setInterval(() => this.schedulePlayback(), this.SCHEDULING_INTERVAL_MS);
      console.log(`👩‍🦳 [LyriaMasterBlock ${instanceId}] Playback scheduler started. Interval ID: ${this.schedulerIntervalId}`);
    }
  }

  private stopScheduler(instanceId: string, clearAudio: boolean): void {
    if (this.schedulerIntervalId !== null) {
      global.clearInterval(this.schedulerIntervalId);
      this.schedulerIntervalId = null;
      console.log(`👩‍🦳 [LyriaMasterBlock ${instanceId}] Playback scheduler stopped.`);
    }
    if (clearAudio) {
      this.audioBufferQueue = [];
      this.activeSources.forEach(source => {
        try { source.stop(); } catch (e) { /* already stopped or not started */ }
        source.disconnect();
      });
      this.activeSources = [];
      this.nextBufferStartTime = 0;
      console.log(`👩‍🦳 [LyriaMasterBlock ${instanceId}] Audio queue and active sources cleared.`);
    }
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
