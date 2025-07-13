import * as Tone from 'tone';
import {
  Scale as AppScale,
} from '@interfaces/lyria';

import { BlockDefinition, BlockInstance, NativeBlock } from '@interfaces/block';
import { createParameterDefinitions } from '../../constants/constants';
import { LiveMusicService, DEFAULT_MUSIC_GENERATION_CONFIG, type LiveMusicServiceCallbacks, PlaybackState, type WeightedPrompt, type LiveMusicGenerationConfig } from '@services/LiveMusicService';
import { Scale as LyriaScale } from '@services/LiveMusicService';
import { ToneAudioNode } from 'tone';
import { Emitter } from 'tone';


const LYRIA_SCALE_OPTIONS = Object.entries(AppScale).map(([label, value]) => ({
  label: label.replace(/_/g, ' ').replace('SHARP', '#').replace('FLAT', 'b'),
  value: value,
}));

const BLOCK_DEFINITION: BlockDefinition = {
  id: 'lyria-realtime-master-v1',
  name: 'Lyria Realtime Master',
  category: 'ai',
  description: 'Generates music in real-time using Lyria. Audio output is handled by the integrated LiveMusicService.',
  inputs: [
    { id: 'scale_cv_in', name: 'Scale CV', type: 'any', description: 'Modulates Lyria Scale (expects string matching GenAIScale value)' },
    { id: 'brightness_cv_in', name: 'Brightness CV', type: 'number', description: 'Modulates Lyria Brightness (0-1)' },
    { id: 'density_cv_in', name: 'Density CV', type: 'number', description: 'Modulates Lyria Density (0-1)' },
    { id: 'seed_cv_in', name: 'Seed CV', type: 'number', description: 'Modulates Lyria Seed (integer)' },
    { id: 'temperature_cv_in', name: 'Temperature CV', type: 'number', description: 'Modulates Lyria Temperature (e.g., 0.1-2.0)' },
    { id: 'guidance_cv_in', name: 'Guidance CV', type: 'number', description: 'Modulates Lyria Guidance Scale (e.g., 1-20)' },
    { id: 'top_k_cv_in', name: 'TopK CV', type: 'number', description: 'Modulates Lyria TopK (integer > 0)' },
    { id: 'bpm_cv_in', name: 'BPM CV', type: 'number', description: 'Modulates Lyria BPM (e.g. 60-180)' },
    { id: 'play_gate_in', name: 'Play Gate', type: 'gate', description: 'Gate for session.play() (high) / session.pause() (low)' },
    { id: 'stop_trigger_in', name: 'Stop Trigger', type: 'trigger', description: 'Trigger for session.stop() and reset' },
    { id: 'reconnect_trigger_in', name: 'Reconnect Trigger', type: 'trigger', description: 'Trigger to reconnect the Lyria session' },
    { id: 'mute_bass_gate_in', name: 'Mute Bass Gate', type: 'gate', description: 'Gate to mute bass track' },
    { id: 'mute_drums_gate_in', name: 'Mute Drums Gate', type: 'gate', description: 'Gate to mute drums track' },
    { id: 'only_bass_drums_gate_in', name: 'Only Bass & Drums Gate', type: 'gate', description: 'Gate to solo bass & drums' },
    { id: 'prompts_in', name: 'Prompts In', type: 'any', description: 'Array of Lyria WeightedPrompt objects [{text: string, weight: number}]' },
  ],
  outputs: [
    { id: 'audio_out', name: 'Audio Output', type: 'audio', description: 'Generated audio from Lyria LiveMusicService.' }
  ],
  parameters: createParameterDefinitions([
    { id: 'initial_prompt_text', name: 'Initial Prompt Text', type: 'text_input', defaultValue: 'cinematic lofi hip hop', description: 'Default text prompt for Lyria session.' },
    { id: 'scale', name: 'Scale', type: 'select', options: LYRIA_SCALE_OPTIONS, defaultValue: AppScale.C_MAJOR_A_MINOR, description: 'Lyria Scale. Overridden by CV if connected.' },
    { id: 'brightness', name: 'Brightness', type: 'slider', toneParam: { minValue: 0, maxValue: 1}, step: 0.01, defaultValue: 0.5 , description: 'Lyria Brightness (0-1). Overridden by CV.' },
    { id: 'density', name: 'Density', type: 'slider', toneParam: { minValue: 0, maxValue: 1}, step: 0.01, defaultValue: 0.5 , description: 'Lyria Density (0-1). Overridden by CV.' },
    { id: 'seed', name: 'Seed', type: 'number_input', defaultValue: 0, description: 'Lyria Seed (0 for random date-based). Overridden by CV.' },
    { id: 'temperature', name: 'Temperature', type: 'slider', toneParam: { minValue: 0.1, maxValue: 2}, step: 0.01, defaultValue: 1.1 , description: 'Lyria Temperature. Overridden by CV.' },
    { id: 'guidance_scale', name: 'Guidance Scale', type: 'slider', toneParam: { minValue: 1, maxValue: 20}, step: 0.1, defaultValue: 7.0 , description: 'Lyria Guidance Scale. Overridden by CV.' },
    { id: 'top_k', name: 'Top K', type: 'number_input', toneParam: { minValue: 1, maxValue: 100}, step: 1, defaultValue: 40 , description: 'Lyria Top K. Overridden by CV.' },
    { id: 'bpm', name: 'BPM', type: 'number_input', toneParam: { minValue: 30, maxValue: 240}, step: 1, defaultValue: 120 , description: 'Lyria BPM. Overridden by CV.' },
  ]),
};

export class LyriaMasterBlock extends ToneAudioNode implements NativeBlock, Emitter {

  name = BLOCK_DEFINITION.name;
  input = new Tone.Gain(1); // PianoGenie doesn't process audio through Tone.js standard signal chain
  output = new Tone.Gain(1); // Output is via emitter

  private liveMusicService: LiveMusicService | null = null;
  private prevParams: Record<string, any> = {};
  private prevInputs: Record<string, any> = {};
  private prevEffectivePrompts: WeightedPrompt[] = [];
  private activeSources: AudioBufferSourceNode[] = [];
  private audioBufferQueue: { buffer: AudioBuffer, bpm: number }[] = [];
  private nextBufferStartTime: number = 0;
  private readonly serviceBufferTimeSec = 2;

  // private outputGainNode: Tone.Gain | null = null;
  private isPlayingAudio: boolean = false;
  private schedulerIntervalId: NodeJS.Timeout | null = null;
  private readonly SCHEDULING_INTERVAL_MS = 50;

  static getDefinition(): BlockDefinition {
    return BLOCK_DEFINITION;
  }


  constructor(
  ) {
    super();
  }

  initialize(initialState?: Partial<BlockInstance>) {
    // this.outputGainNode = new Tone.Gain(1);
    // this.input = new Tone.Gain(1);
    // this.output = this.outputGainNode;

    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      console.error('👩‍🦳 [LyriaMasterBlock] API_KEY not found in environment variables.');
      return;
    }

    const callbacks: LiveMusicServiceCallbacks = {
      onPlaybackStateChange: (newState: PlaybackState) => {
        console.log(`👩‍🦳 [LyriaMasterBlock] Playback state: ${newState}`);
        this.isPlayingAudio = this.liveMusicService?.getPlaybackState() === PlaybackState.PLAYING;
      },
      onFilteredPrompt: (promptInfo: { text: string; filteredReason: string }) => {
        console.log(`👩‍🦳 [LyriaMasterBlock] Filtered prompt: "${promptInfo.text}", Reason: ${promptInfo.filteredReason}`);
      },
      onSetupComplete: () => {
        console.log('👩‍🦳 [LyriaMasterBlock] LiveMusicService setup complete and ready.');
      },
      onError: (error: string) => {
        console.error(`👩‍🦳 [LyriaMasterBlock] LiveMusicService Error: ${error}`);
      },
      onClose: (message: string) => {
        console.log(`👩‍🦳 [LyriaMasterBlock] LiveMusicService closed: ${message}`);
      },
      onOutputNodeChanged: () => {
        console.log('👩‍🦳 [LyriaMasterBlock] LiveMusicService internal output node changed. This block will manage its own output.');
      },
      onAudioBufferProcessed: ((buffer: AudioBuffer) => {
        this.audioBufferQueue.push({ buffer, bpm: 666 });
        if (this.isPlayingAudio && !this.schedulerIntervalId) {
          this.startScheduler();
        }
      })
    };

    this.isPlayingAudio = false;

    if (apiKey) {
      const initialServiceConfig: Partial<LiveMusicGenerationConfig> = {
        ...DEFAULT_MUSIC_GENERATION_CONFIG,
      };
      initialState?.parameters.forEach(param => {
        if (param.id === 'bpm' && param.currentValue !== undefined) {
          initialServiceConfig.bpm = param.currentValue as number;
        }
        if (param.id === 'scale' && param.currentValue !== undefined) {
          const scaleValue = param.currentValue as string;
          if (Object.values(LyriaScale).some(validScale => validScale === scaleValue)) {
            initialServiceConfig.scale = scaleValue as any;
          } else {
            console.warn(`👩‍🦳 [LyriaMasterBlock] Invalid initial scale value: ${scaleValue}`);
          }
        }
      });

      this.liveMusicService = LiveMusicService.getInstance(apiKey, this.audioContext, callbacks, initialServiceConfig);

      this.liveMusicService.connect()
        .then(() => {
          console.log('👩‍🦳 [LyriaMasterBlock] LiveMusicService connect() initiated.');
          const initialPromptTextParam = initialState?.parameters.find(p => p.id === 'initial_prompt_text');
          const initialPromptWeightParam = initialState?.parameters.find(p => p.id === 'initial_prompt_weight');
          let initialPrompts: WeightedPrompt[] = [];
          if (initialPromptTextParam && initialPromptTextParam.currentValue) {
            initialPrompts = [{
              text: initialPromptTextParam.currentValue as string,
              weight: (initialPromptWeightParam?.currentValue as number) ?? 1.0
            }];
            return this.liveMusicService?.setWeightedPrompts(initialPrompts);
          }
          this.prevEffectivePrompts = JSON.parse(JSON.stringify(initialPrompts));
        })
        .then(() => {
          console.log('👩‍🦳 [LyriaMasterBlock] LiveMusicService promt setted.');
          this.liveMusicService?.play();
        })
        .catch(error => {
          console.error(`👩‍🦳 [LyriaMasterBlock] Failed to connect LiveMusicService: ${error}`);
        });
    } else {
      console.error('👩‍🦳 [LyriaMasterBlock] LiveMusicService could not be initialized due to missing API key or AudioContext.');
    }

    initialState?.parameters.forEach(param => {
      this.prevParams[param.id] = param.currentValue;
    });
    this.prevInputs = {};
  }

  update(
    instance: BlockInstance,
  ): void {
    if (!this.liveMusicService) {
      console.error('👩‍🦳 [LyriaMasterBlock] LiveMusicService or AudioContext not available in updateNodeParams.');
      return;
    }

    const parameters = instance.parameters || [];
    const currentParamsMap = new Map(parameters.map(p => [p.id, p.currentValue]));
    const currentInputs = currentParamsMap;

    this.handleConfigurationChanges(currentParamsMap, currentInputs);
    this.handlePromptChanges(currentParamsMap, currentInputs);
    this.handlePlaybackControl(currentInputs);
    this.handleTrackMuting(currentInputs);

    this.prevParams = Object.fromEntries(currentParamsMap);
    if (currentInputs) {
      this.prevInputs = { ...currentInputs };
    } else {
      this.prevInputs = {};
    }
  }

  private handleConfigurationChanges(
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
      guidance: 'guidance_cv_in',
      topK: 'top_k_cv_in',
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
        if (serviceKey === 'scale') {
          const scaleStringValue = String(valueToSet);
          if (Object.values(LyriaScale).some(validScale => validScale === scaleStringValue)) {
            newConfig.scale = scaleStringValue as LyriaScale | undefined;
          }
        } else if (serviceKey === 'seed') {
          const numSeed = Math.floor(Number(valueToSet));
          if (valueSource === 'param' && numSeed === 0) {
            newConfig.seed = undefined;
          } else if (!Number.isNaN(numSeed)) {
            newConfig.seed = numSeed;
          } else {
            newConfig.seed = undefined;
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

      const prevCvValue = this.prevInputs?.[cvInputKey];
      const prevParamValue = this.prevParams?.[blockParamKey];
      let effectiveOldValue = (prevCvValue !== undefined && prevCvValue !== null) ? prevCvValue : prevParamValue;
      if (serviceKey === 'seed' && valueSource === 'param' && Number(paramValue) === 0 && (prevCvValue === undefined || prevCvValue === null) && Number(this.prevParams?.[blockParamKey]) === 0) {
      } else if (serviceKey === 'scale' && !Object.values(LyriaScale).includes(valueToSet as LyriaScale)) {
        if (valueToSet !== effectiveOldValue) configChanged = true;
      }
      else if (newConfig[serviceKey] !== undefined && newConfig[serviceKey] !== effectiveOldValue) {
        if (valueToSet !== effectiveOldValue) {
          configChanged = true;
        }
      } else if (newConfig[serviceKey] === undefined && effectiveOldValue !== undefined && serviceKey === 'seed' && valueSource === 'param' && Number(paramValue) === 0) {
        configChanged = true;
      } else if (newConfig[serviceKey] !== undefined && effectiveOldValue === undefined) {
        configChanged = true;
      }
    }

    if (configChanged) {
      console.log(`👩‍🦳 [LyriaMasterBlock] Configuration changed. Sending updates to LiveMusicService: ${JSON.stringify(newConfig)}`);
      this.liveMusicService.setMusicGenerationConfig(newConfig);
    }
  }

  private handlePromptChanges(
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

    if (JSON.stringify(effectivePrompts) !== JSON.stringify(this.prevEffectivePrompts)) {
      console.log(`👩‍🦳 [LyriaMasterBlock] Prompts changed. Sending update to LiveMusicService. Prompts: ${JSON.stringify(effectivePrompts)}`);
      this.liveMusicService.setWeightedPrompts(effectivePrompts);
      this.prevEffectivePrompts = JSON.parse(JSON.stringify(effectivePrompts));
    }
  }

  private handlePlaybackControl(
    currentInputs?: Record<string, any>
  ): void {
    if (!this.liveMusicService) return;

    const playGate = !!currentInputs?.play_gate_in;
    const stopTrigger = !!currentInputs?.stop_trigger_in;
    const reconnectTrigger = !!currentInputs?.reconnect_trigger_in;

    const prevStopTrigger = !!this.prevInputs?.stop_trigger_in;
    const prevReconnectTrigger = !!this.prevInputs?.reconnect_trigger_in;

    const currentServiceState = this.liveMusicService.getPlaybackState();
    if (stopTrigger && !prevStopTrigger) {
      console.log('👩‍🦳 [LyriaMasterBlock] Stop trigger activated.');
      this.liveMusicService.stop();
      this.isPlayingAudio = false;
      this.stopScheduler(true);
      return;
    }

    if (reconnectTrigger && !prevReconnectTrigger) {
      console.log('👩‍🦳 [LyriaMasterBlock] Reconnect trigger activated.');
      this.isPlayingAudio = false;
      this.stopScheduler(true);
      this.liveMusicService.reconnect();
      return;
    }

    if (playGate) {
      if (!this.isPlayingAudio || currentServiceState === PlaybackState.PAUSED || currentServiceState === PlaybackState.STOPPED) {
        console.log(`👩‍🦳 [LyriaMasterBlock] Play gate high. Current state: ${currentServiceState}, isPlayingAudio: ${this.isPlayingAudio}. Requesting play.`);
        if (currentServiceState === PlaybackState.STOPPED) {
          this.nextBufferStartTime = 0;
        }
        this.liveMusicService.play(this.prevEffectivePrompts);
        this.isPlayingAudio = true;
        this.startScheduler();
      }
    } else {
      if (this.isPlayingAudio && (currentServiceState === PlaybackState.PLAYING || currentServiceState === PlaybackState.LOADING)) {
        console.log(`👩‍🦳 [LyriaMasterBlock] Play gate low. Current state: ${currentServiceState}, isPlayingAudio: ${this.isPlayingAudio}. Requesting pause.`);
        this.liveMusicService.pause();
        this.isPlayingAudio = false;
        this.stopScheduler(false);
      }
    }
  }

  private handleTrackMuting(
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
        onlyBassAndDrums: onlyBassDrumsGate,
      };
      console.log(`👩‍🦳 [LyriaMasterBlock] Track mute states changed. Sending update: ${JSON.stringify(newMuteConfig)}`);
      this.liveMusicService.setMusicGenerationConfig(newMuteConfig);
    }
  }

  private schedulePlayback(): void {
    if (!this.isPlayingAudio) {
      if (!this.isPlayingAudio && this.schedulerIntervalId) {
        clearInterval(this.schedulerIntervalId);
        this.schedulerIntervalId = null;
      }
      return;
    }

    const currentTime = this.audioContext.currentTime;

    if (this.nextBufferStartTime === 0 && this.audioBufferQueue.length > 0) {
      this.nextBufferStartTime = currentTime + this.serviceBufferTimeSec;
      console.log(`👩‍🦳 [LyriaMasterBlock] Initializing playback. First buffer to start at: ${this.nextBufferStartTime.toFixed(3)} (current: ${currentTime.toFixed(3)})`);
    }

    while (this.audioBufferQueue.length > 0 && this.nextBufferStartTime <= currentTime + this.serviceBufferTimeSec + 1.0) {
      if (this.nextBufferStartTime < currentTime - 0.1) {
        console.log(`👩‍🦳 [LyriaMasterBlock] Buffer underrun or significant scheduling lag. Resetting buffer time. Next expected: ${this.nextBufferStartTime.toFixed(3)}, Current: ${currentTime.toFixed(3)}`);
        this.nextBufferStartTime = currentTime + this.serviceBufferTimeSec;
      }

      const audioItem = this.audioBufferQueue.shift();
      if (!audioItem) continue;

      const source = new Tone.ToneBufferSource();
      source.buffer = audioItem.buffer as Tone.ToneAudioBuffer;
      source.connect(this.output);

      source.start(this.nextBufferStartTime);

      this.nextBufferStartTime += audioItem.buffer.duration;
    }
  }

  private startScheduler(): void {
    if (this.schedulerIntervalId === null) {
      this.schedulePlayback();
      this.schedulerIntervalId = setInterval(() => this.schedulePlayback(), this.SCHEDULING_INTERVAL_MS);
      console.log(`👩‍🦳 [LyriaMasterBlock] Playback scheduler started. Interval ID: ${this.schedulerIntervalId}`);
    }
  }

  private stopScheduler(clearAudio: boolean): void {
    if (this.schedulerIntervalId !== null) {
      global.clearInterval(this.schedulerIntervalId);
      this.schedulerIntervalId = null;
      console.log('👩‍🦳 [LyriaMasterBlock] Playback scheduler stopped.');
    }
    if (clearAudio) {
      this.audioBufferQueue = [];
      this.activeSources.forEach(source => {
        try { source.stop(); } catch (e) { /* already stopped or not started */ }
        source.disconnect();
      });
      this.activeSources = [];
      this.nextBufferStartTime = 0;
      console.log('👩‍🦳 [LyriaMasterBlock] Audio queue and active sources cleared.');
    }
  }

  destroy() {
    this.stopScheduler(true);
    this.liveMusicService?.close();
    this.output.dispose();
    this.input.dispose();
  }
}