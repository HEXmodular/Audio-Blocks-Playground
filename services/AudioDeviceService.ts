/**
 * This service manages audio output devices available in the user's system.
 * It provides functionality to list all available audio output devices and allows the user or application to select a preferred device.
 * The service interacts with the `AudioContext` to change the audio output sink to the selected device, if the browser supports this capability.
 * It also monitors for changes in the available devices, such as when a new audio device is connected or an existing one is disconnected.
 * This ensures the application can adapt to changes in the user's audio hardware configuration.
 */
export class AudioDeviceService {
  private static instance: AudioDeviceService;

  private onDeviceListChanged: (devices: MediaDeviceInfo[]) => void;
  private onSelectedSinkIdChanged: (sinkId: string) => void;

  private currentAudioContext: AudioContext | null = null;
  private currentMasterGainNode: GainNode | null = null;
  private availableOutputDevices: MediaDeviceInfo[] = [];
  private selectedSinkIdInternal: string = 'default';

  private constructor(
    onDeviceListChanged: (devices: MediaDeviceInfo[]) => void,
    onSelectedSinkIdChanged: (sinkId: string) => void
  ) {
    this.onDeviceListChanged = onDeviceListChanged;
    this.onSelectedSinkIdChanged = onSelectedSinkIdChanged;
    console.log('[AudioDeviceService] Initialized');
  }

  public static getInstance(
    onDeviceListChanged: (devices: MediaDeviceInfo[]) => void,
    onSelectedSinkIdChanged: (sinkId: string) => void
  ): AudioDeviceService {
    if (!AudioDeviceService.instance) {
      AudioDeviceService.instance = new AudioDeviceService(onDeviceListChanged, onSelectedSinkIdChanged);
    }
    return AudioDeviceService.instance;
  }

  public setAudioNodes(audioContext: AudioContext | null, masterGainNode: GainNode | null): void {
    this.currentAudioContext = audioContext;
    this.currentMasterGainNode = masterGainNode;
    this.listOutputDevices();
  }

  public async listOutputDevices(): Promise<void> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      console.warn("[AudioDeviceService] enumerateDevices not supported.");
      this.setAvailableOutputDevices([]);
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOutputDevices = devices.filter(device => device.kind === 'audiooutput');
      this.setAvailableOutputDevices(audioOutputDevices);
    } catch (err) {
      console.error(`[AudioDeviceService] Error listing output devices: ${(err as Error).message}`);
      this.setAvailableOutputDevices([]);
    }
  }

  private setAvailableOutputDevices(devices: MediaDeviceInfo[]): void {
    this.availableOutputDevices = devices;
    this.onDeviceListChanged(devices);
  }

  public getAvailableOutputDevices(): MediaDeviceInfo[] {
    return this.availableOutputDevices;
  }

  private setSelectedSinkIdInternal(sinkId: string): void {
    this.selectedSinkIdInternal = sinkId;
    this.onSelectedSinkIdChanged(sinkId);
  }

  public getSelectedSinkId(): string {
    return this.selectedSinkIdInternal;
  }

  public async setOutputDevice(sinkId: string): Promise<boolean> {
    if (!this.currentAudioContext || !(this.currentAudioContext as any).setSinkId) {
      console.warn("[AudioDeviceService] setSinkId is not supported by this browser or AudioContext not initialized.");
      return false;
    }
    try {
      if (this.currentMasterGainNode && this.currentAudioContext.destination) {
        try {
          this.currentMasterGainNode.disconnect(this.currentAudioContext.destination);
        } catch (e) {
          // Handle disconnect error
        }
      }

      await (this.currentAudioContext as any).setSinkId(sinkId);
      this.setSelectedSinkIdInternal(sinkId);
      console.log(`[AudioDeviceService] Audio output device set to: ${sinkId}`);

      if (this.currentMasterGainNode) {
        this.currentMasterGainNode.connect(this.currentAudioContext.destination);
      }
      return true;
    } catch (err) {
      console.error(`[AudioDeviceService] Error setting output device: ${(err as Error).message}`);
      if (this.currentMasterGainNode && this.currentAudioContext?.destination) {
        try {
          this.currentMasterGainNode.connect(this.currentAudioContext.destination);
        } catch (e) {
          console.error(`[AudioDeviceService] Failed to fallback connect masterGain: ${(e as Error).message}`);
        }
      }
      return false;
    }
  }

  public startDeviceChangeListener(): void {
    navigator.mediaDevices?.addEventListener('devicechange', this.handleDeviceChange);
    console.log('[AudioDeviceService] Started device change listener.');
  }

  public stopDeviceChangeListener(): void {
    navigator.mediaDevices?.removeEventListener('devicechange', this.handleDeviceChange);
    console.log('[AudioDeviceService] Stopped device change listener.');
  }

  private handleDeviceChange = (): void => {
    console.log('[AudioDeviceService] devicechange event detected.');
    this.listOutputDevices();
  };

  public cleanup(): void {
    this.stopDeviceChangeListener();
    console.log('[AudioDeviceService] Cleaned up.');
  }
}
