import * as Tone from 'tone';
import {
} from '@interfaces/lyria';

import { BlockDefinition, BlockInstance, NativeBlock, WithEmitter } from '@interfaces/block';
import { createParameterDefinitions } from '@constants/constants';
import { LiveMusicService, DEFAULT_MUSIC_GENERATION_CONFIG, type LiveMusicServiceCallbacks, PlaybackState, type WeightedPrompt, type LiveMusicGenerationConfig } from '@services/LiveMusicService';
import { getTransport, Signal, ToneAudioBuffer, ToneAudioNode } from 'tone';
import { Scale } from '@google/genai';

const LYRIA_SCALE_OPTIONS = Object.entries(Scale).map(([label, value]) => ({
  label: label.replace(/_/g, ' ').replace('SHARP', '#').replace('FLAT', 'b'),
  value: value,
}));

const BLOCK_DEFINITION: BlockDefinition = {
  id: 'lyria-realtime-master-v1',
  name: 'Lyria Realtime Master',
  category: 'ai',
  description: 'Generates music in real-time using Lyria. Audio output is handled by the integrated LiveMusicService.',
  inputs: [
    { id: 'scale', name: 'Scale', type: 'any', description: 'Modulates Lyria Scale (expects string matching GenAIScale value)' },
    { id: 'brightness', name: 'Brightness', type: 'audio', description: 'Modulates Lyria Brightness (0-1)' },
    { id: 'density', name: 'Density', type: 'number', description: 'Modulates Lyria Density (0-1)' },
    { id: 'seed', name: 'Seed', type: 'number', description: 'Modulates Lyria Seed (integer)' },
    { id: 'temperature', name: 'Temperature', type: 'number', description: 'Modulates Lyria Temperature (e.g., 0.1-2.0)' },
    { id: 'guidance', name: 'Guidance', type: 'number', description: 'Modulates Lyria Guidance Scale (e.g., 1-20)' },
    { id: 'top_k', name: 'TopK', type: 'number', description: 'Modulates Lyria TopK (integer > 0)' },
    { id: 'bpm', name: 'BPM', type: 'number', description: 'Modulates Lyria BPM (e.g. 60-180)' },
    { id: 'play_gate', name: 'Play Gate', type: 'gate', description: 'Gate for session.play() (high) / session.pause() (low)' },
    { id: 'stop_trigger', name: 'Stop Trigger', type: 'trigger', description: 'Trigger for session.stop() and reset' },
    { id: 'reconnect_trigger', name: 'Reconnect Trigger', type: 'trigger', description: 'Trigger to reconnect the Lyria session' },
    { id: 'mute_bass_gate', name: 'Mute Bass Gate', type: 'gate', description: 'Gate to mute bass track' },
    { id: 'mute_drums_gate', name: 'Mute Drums Gate', type: 'gate', description: 'Gate to mute drums track' },
    { id: 'only_bass_drums_gate', name: 'Only Bass & Drums Gate', type: 'gate', description: 'Gate to solo bass & drums' },
    { id: 'prompts', name: 'Prompts In', type: 'string', description: 'Array of Lyria WeightedPrompt objects [{text: string, weight: number}]' },
  ],
  outputs: [
    { id: 'audio_out', name: 'Audio Output', type: 'audio', description: 'Generated audio from Lyria LiveMusicService.' }
  ],
  parameters: createParameterDefinitions([
    { id: 'initial_prompt_text', name: 'Initial Prompt Text', type: 'text_input', defaultValue: 'cinematic lofi hip hop', description: 'Default text prompt for Lyria session.' },
    { id: 'scale', name: 'Scale', type: 'select', options: LYRIA_SCALE_OPTIONS, defaultValue: Scale.SCALE_UNSPECIFIED, description: 'Lyria Scale. Overridden by if connected.' },
    { id: 'brightness', name: 'Brightness', type: 'slider', toneParam: { minValue: 0, maxValue: 1 }, step: 0.01, defaultValue: 0.5, description: 'Lyria Brightness (0-1). Overridden by.' },
    { id: 'density', name: 'Density', type: 'slider', toneParam: { minValue: 0, maxValue: 1 }, step: 0.01, defaultValue: 0.5, description: 'Lyria Density (0-1). Overridden by.' },
    { id: 'seed', name: 'Seed', type: 'number_input', defaultValue: 0, description: 'Lyria Seed (0 for random date-based). Overridden by.' },
    { id: 'temperature', name: 'Temperature', type: 'slider', toneParam: { minValue: 0.1, maxValue: 2 }, step: 0.01, defaultValue: 1.1, description: 'Lyria Temperature. Overridden by.' },
    { id: 'guidance_scale', name: 'Guidance Scale', type: 'slider', toneParam: { minValue: 1, maxValue: 20 }, step: 0.1, defaultValue: 7.0, description: 'Lyria Guidance Scale. Overridden by.' },
    { id: 'top_k', name: 'Top K', type: 'number_input', toneParam: { minValue: 1, maxValue: 100 }, step: 1, defaultValue: 40, description: 'Lyria Top K. Overridden by.' },
    { id: 'bpm', name: 'BPM', type: 'number_input', toneParam: { minValue: 30, maxValue: 240 }, step: 1, defaultValue: 120, description: 'Lyria BPM. Overridden by.' },
  ]),
};

export class LyriaMasterBlock extends WithEmitter implements Partial<ToneAudioNode>, NativeBlock {

  name = BLOCK_DEFINITION.name;
  input = new Tone.Gain(1); // PianoGenie doesn't process audio through Tone.js standard signal chain
  output = new Tone.Player(); // Output is via emitter
  player = this.output;

  brightness = new Signal({
    value: 0.5,
    units: 'number',
    minValue: 0,
    maxValue: 1,
  });

  private liveMusicService: LiveMusicService | null = null;
  private prevParams: Record<string, any> = {};
  private prevInputs: Record<string, any> = {};
  private prevEffectivePrompts: WeightedPrompt[] = [];


  private isPlayingAudio: boolean = false;
  private nextPlayTime = 0; // time of next scheduled play


  static getDefinition(): BlockDefinition {
    return BLOCK_DEFINITION;
  }


  constructor(
  ) {
    super();
    this.initialize();

    // this.brightness.

    this._emitter.on('play_gate', (payload) => {
      // console.log("👩‍🦳 [LyriaMasterBlock] Play gate received.", payload);
      payload && this.handlePlaybackControl({ play_gate: payload });
    })

    this._emitter.on('stop_trigger', (payload) => {
      // console.log("👩‍🦳 [LyriaMasterBlock] Stop trigger received.", payload);
      payload && this.handlePlaybackControl({ stop_trigger: payload });
    })

    this._emitter.on('reconnect_trigger', (payload) => {
      // console.log("👩‍🦳 [LyriaMasterBlock] Reconnect trigger received.", payload);
      payload && this.handlePlaybackControl({ reconnect_trigger: payload });
    })

    this._emitter.on('mute_bass_gate', (payload) => {
      // console.log("👩‍🦳 [LyriaMasterBlock] Mute bass gate received.", payload);
      payload && this.handleTrackMuting({ mute_bass_gate: payload });
    })

    this._emitter.on('mute_drums_gate', (payload) => {
      // console.log("👩‍🦳 [LyriaMasterBlock] Mute drums gate received.", payload);
      payload && this.handleTrackMuting({ mute_drums_gate: payload });
    })

    this._emitter.on('only_bass_drums_gate', (payload) => {
      // console.log("👩‍🦳 [LyriaMasterBlock] Only bass & drums gate received.", payload);
      payload && this.handleTrackMuting({ only_bass_drums_gate: payload });
    })

    this._emitter.on('prompts', (payload) => {
      // console.log("👩‍🦳 [LyriaMasterBlock] Prompts received.", payload);
      try {
        payload && this.handlePromptChanges(new Map(), { prompts:  JSON.parse(payload) });
      } catch (error) {
        console.error("👩‍🦳 [LyriaMasterBlock] Error handling prompts:", error);
      }
    })

  }

  initialize() {

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
        console.warn(`👩‍🦳 [LyriaMasterBlock] Filtered prompt: "${promptInfo.text}", Reason: ${promptInfo.filteredReason}`);
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
      onAudioBufferProcessed: (buffer: ToneAudioBuffer) => {
        this.addToQueue(buffer);
      }
    };

    this.isPlayingAudio = false;

    if (apiKey) {
      const initialServiceConfig: Partial<LiveMusicGenerationConfig> = {
        ...DEFAULT_MUSIC_GENERATION_CONFIG,
      };
      BLOCK_DEFINITION.parameters.forEach(param => {
        if (param.id === 'bpm' && param.defaultValue !== undefined) {
          initialServiceConfig.bpm = param.defaultValue as number;
        }
        if (param.id === 'scale' && param.defaultValue !== undefined) {
          const scaleValue = param.defaultValue as string;
          if (Object.values(Scale).some(validScale => validScale === scaleValue)) {
            initialServiceConfig.scale = scaleValue as any;
          } else {
            console.warn(`👩‍🦳 [LyriaMasterBlock] Invalid initial scale value: ${scaleValue}`);
          }
        }
      });

      this.liveMusicService = LiveMusicService.getInstance(apiKey, callbacks, initialServiceConfig);

      this.liveMusicService.connect()
        .then(() => {
          console.log('👩‍🦳 [LyriaMasterBlock] LiveMusicService connect() initiated.');
          const initialPromptTextParam = BLOCK_DEFINITION.parameters.find(p => p.id === 'initial_prompt_text');
          const initialPromptWeightParam = BLOCK_DEFINITION.parameters.find(p => p.id === 'initial_prompt_weight');
          let initialPrompts: WeightedPrompt[] = [];
          if (initialPromptTextParam && initialPromptTextParam.defaultValue) {
            initialPrompts = [{
              text: initialPromptTextParam.defaultValue as string,
              weight: (initialPromptWeightParam?.defaultValue as number) ?? 1.0
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

    BLOCK_DEFINITION.parameters.forEach(param => {
      this.prevParams[param.id] = param.defaultValue;
    });
    this.prevInputs = {};
  }

  // --- Функция для добавления в очередь ---
  private addToQueue(buffer: ToneAudioBuffer) {
    // Рассчитываем время старта: сразу после предыдущего звука
    // или сейчас, если очередь пуста.
    const startTime = Math.max(Tone.now(), this.nextPlayTime);

    // Планируем событие на транспорте
    getTransport().scheduleOnce((time: number) => {
      this.player.buffer = buffer;
      this.player.start(time);
    }, startTime);

    // Обновляем время конца очереди
    this.nextPlayTime = startTime + buffer.duration;

    // console.log(`👩‍🦳 [LyriaMasterBlock] Добавлен звук в очередь на время ${startTime.toFixed(2)}с. Длительность: ${buffer.duration.toFixed(2)}с`);
  }

  updateFromBlockInstance(
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
      scale: 'scale',
      brightness: 'brightness',
      density: 'density',
      seed: 'seed',
      temperature: 'temperature',
      guidance: 'guidance',
      topK: 'top_k',
      bpm: 'bpm',
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
          if (Object.values(Scale).some(validScale => validScale === scaleStringValue)) {
            newConfig.scale = scaleStringValue as (Scale | undefined);
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
      } else if (serviceKey === 'scale' && !Object.values(Scale).includes(valueToSet)) {
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

    const promptsInput = currentInputs?.prompts;
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
      // console.log(`👩‍🦳 [LyriaMasterBlock] Prompts changed. Sending update to LiveMusicService. Prompts: ${JSON.stringify(effectivePrompts)}`);
      this.liveMusicService.setWeightedPrompts(effectivePrompts);
      this.prevEffectivePrompts = JSON.parse(JSON.stringify(effectivePrompts));
    }
  }

  private handlePlaybackControl(
    currentInputs?: Record<string, any>
  ): void {
    if (!this.liveMusicService) return;

    const playGate = !!currentInputs?.play_gate;
    const stopTrigger = !!currentInputs?.stop_trigger;
    const reconnectTrigger = !!currentInputs?.reconnect_trigger;

    const prevStopTrigger = !!this.prevInputs?.stop_trigger;
    const prevReconnectTrigger = !!this.prevInputs?.reconnect_trigger;

    const currentServiceState = this.liveMusicService.getPlaybackState();
    if (stopTrigger && !prevStopTrigger) {
      console.log('👩‍🦳 [LyriaMasterBlock] Stop trigger activated.');
      this.liveMusicService.stop();
      this.isPlayingAudio = false;
      // todo
      // this.stopScheduler(true);
      return;
    }

    if (reconnectTrigger && !prevReconnectTrigger) {
      console.log('👩‍🦳 [LyriaMasterBlock] Reconnect trigger activated.');
      this.isPlayingAudio = false;
      // todo
      // this.stopScheduler(true);
      this.liveMusicService.reconnect();
      return;
    }

    if (playGate) {
      if (!this.isPlayingAudio || currentServiceState === PlaybackState.PAUSED || currentServiceState === PlaybackState.STOPPED) {
        console.log(`👩‍🦳 [LyriaMasterBlock] Play gate high. Current state: ${currentServiceState}, isPlayingAudio: ${this.isPlayingAudio}. Requesting play.`);
        if (currentServiceState === PlaybackState.STOPPED) {
          // this.nextBufferStartTime = 0;
        }
        this.liveMusicService.play(this.prevEffectivePrompts);
        this.isPlayingAudio = true;
        // todo
        // this.startScheduler();
      }
    } else {
      if (this.isPlayingAudio && (currentServiceState === PlaybackState.PLAYING || currentServiceState === PlaybackState.LOADING)) {
        console.log(`👩‍🦳 [LyriaMasterBlock] Play gate low. Current state: ${currentServiceState}, isPlayingAudio: ${this.isPlayingAudio}. Requesting pause.`);
        this.liveMusicService.pause();
        this.isPlayingAudio = false;
        // todo
        // this.stopScheduler(false);
      }
    }
  }

  private handleTrackMuting(
    currentInputs?: Record<string, any>
  ): void {
    if (!this.liveMusicService) return;

    const muteBassGate = !!currentInputs?.mute_bass_gate;
    const muteDrumsGate = !!currentInputs?.mute_drums_gate;
    const onlyBassDrumsGate = !!currentInputs?.only_bass_drums_gate;

    const prevMuteBassGate = !!this.prevInputs?.mute_bass_gate;
    const prevMuteDrumsGate = !!this.prevInputs?.mute_drums_gate;
    const prevOnlyBassDrumsGate = !!this.prevInputs?.only_bass_drums_gate;

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

  destroy() {
    // this.stopScheduler(true);
    this.liveMusicService?.dispose();
    this.output.dispose();
    this.input.dispose();
  }
}