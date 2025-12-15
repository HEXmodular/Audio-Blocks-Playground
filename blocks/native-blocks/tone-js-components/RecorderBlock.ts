import { Recorder, ToneAudioNode, ToneAudioNodeOptions } from 'tone';
import { NativeBlock, BlockDefinition, BlockInstance } from '@interfaces/block';
import { createParameterDefinitions } from '@constants/constants';

const BLOCK_DEFINITION: BlockDefinition = {
  id: 'tone-recorder-v1',
  name: 'Recorder',
  description: 'Records audio from its input and allows downloading the result.',
  category: 'i/o',
  inputs: [
    { id: 'audio_in', name: 'Audio', type: 'audio', description: 'The audio signal to record.' },
    { id: 'play', name: 'Play trigger In', type: 'trigger', description: 'Plays the recorded audio.' },
    { id: 'stop', name: 'Stop trigger In', type: 'trigger', description: 'Stops the recorded audio.' }
  ],
  outputs: [
    { id: 'audio_out', name: 'Audio Out', type: 'audio', description: 'The recorded audio signal.' },
  ],
  parameters: createParameterDefinitions([
    {
      id: 'recording',
      name: 'Record',
      type: 'toggle',
      defaultValue: false,
      description: 'Start or stop recording.'
    }
  ]),
};

// TODO протестировать, добавить сохранение в файл, возможно добавить интеграцию с проигрывателем
export class RecorderBlock extends ToneAudioNode<ToneAudioNodeOptions> implements NativeBlock {
  readonly name: string = BLOCK_DEFINITION.name;
  private recorder: Recorder;
  private isRecording = false;
  private blobUrl: string | null = null;
  readonly input: ToneAudioNode;
  readonly output = undefined;

  constructor() {
    super(); // Gain node constructor
    this.recorder = new Recorder();
    this.input = this.recorder;
  }

  public static getDefinition(): BlockDefinition {
    return BLOCK_DEFINITION;
  }

  public updateFromBlockInstance(instance: BlockInstance): void {
    if (!instance?.parameters) {
      return;
    }
    const recordingParam = instance.parameters.find(p => p.id === 'recording');
    if (recordingParam) {
      const shouldBeRecording = recordingParam.currentValue as boolean;
      if (shouldBeRecording && !this.isRecording) {
        this.startRecording();
      } else if (!shouldBeRecording && this.isRecording) {
        this.stopRecording();
      }
    }
  }

  private startRecording() {
    if (this.isRecording) return;
    this.isRecording = true;
    this.recorder.start();
  }

  private async stopRecording() {
    if (!this.isRecording) return;
    
    const blob = await this.recorder.stop();
    this.isRecording = false;

    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
    }
    
    this.blobUrl = URL.createObjectURL(blob);
    
    const anchor = document.createElement('a');
    anchor.href = this.blobUrl;
    anchor.download = `recording-${new Date().toISOString()}.webm`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }

  dispose() {
    super.dispose();
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
    }
    this.recorder.dispose();
    return this;
  }
}
