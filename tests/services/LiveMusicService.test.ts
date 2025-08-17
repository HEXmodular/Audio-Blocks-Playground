import { PlaybackState } from '@interfaces';
// Unused type imports Scale, WeightedPrompt, RealGoogleGenAIType removed
import type { LiveMusicService as LiveMusicServiceType, LiveMusicServiceCallbacks, LiveMusicGenerationConfig, DEFAULT_MUSIC_GENERATION_CONFIG as RealDefaultConfig } from '@services/LiveMusicService';
import type { LiveMusicSession, LiveMusicServerMessage } from '@google/genai';

// --- Mock Control Variables (Module Scope) ---
interface ConnectController {
  resolve: (value: Partial<LiveMusicSession>) => void;
  reject: (reason?: any) => void;
  callbacks: {
    onmessage: (msg: LiveMusicServerMessage) => Promise<void>;
    onerror: (err: ErrorEvent) => void;
    onclose: (evt: CloseEvent) => void;
  };
  sessionSpies: {
    play: jest.Mock;
    pause: jest.Mock;
    stop: jest.Mock;
    setWeightedPrompts: jest.Mock;
    setMusicGenerationConfig: jest.Mock;
  };
}

// This will be the core jest.fn() for the connect method in the mock factory.
// Its implementation will be set in beforeEach.
let mockedLowLevelConnectInstance: jest.Mock;

// --- Initial Mocks ---
jest.mock('@google/genai', () => {
  // This jest.fn() is created once by Jest when the factory runs.
  // It's assigned to mockedLowLevelConnectInstance so beforeEach can reference it.
  mockedLowLevelConnectInstance = jest.fn(); 
  return {
    __esModule: true,
    GoogleGenAI: jest.fn().mockImplementation(() => ({
      live: {
        music: {
          connect: mockedLowLevelConnectInstance,
        },
      },
    })),
  };
});

const mockDecode = jest.fn(data => new Uint8Array(data?.length || 0));
const mockDecodeAudioData = jest.fn();
jest.mock('@utils/utils', () => ({
  decode: mockDecode,
  decodeAudioData: mockDecodeAudioData,
}));

const mockGetCurrentDateAsSeed = jest.fn(() => 12345);
jest.mock('@utils/dateUtils', () => ({
  getCurrentDateAsSeed: mockGetCurrentDateAsSeed,
}));

const mockAudioBuffer = {
  duration: 1.0, numberOfChannels: 2, sampleRate: 48000, length: 48000,
  getChannelData: jest.fn(() => new Float32Array(48000)),
  copyFromChannel: jest.fn(), copyToChannel: jest.fn(),
};
global.AudioContext = jest.fn().mockImplementation(() => ({
  createGain: jest.fn(() => ({
    gain: { value: 1, setValueAtTime: jest.fn(), linearRampToValueAtTime: jest.fn(), cancelScheduledValues: jest.fn() },
    connect: jest.fn(), disconnect: jest.fn(),
  })),
  createBufferSource: jest.fn(),
  decodeAudioData: mockDecodeAudioData,
  currentTime: 0, resume: jest.fn(() => Promise.resolve()), state: 'running', sampleRate: 48000,
}));


// --- Test Suite ---
describe('LiveMusicService', () => {
  let LiveMusicServiceModule: typeof import('@services/LiveMusicService');
  let LiveMusicService: typeof LiveMusicServiceType;
  let DEFAULT_MUSIC_GENERATION_CONFIG: typeof RealDefaultConfig;

  let audioContext: AudioContext;
  let mockServiceCallbacks: LiveMusicServiceCallbacks;
  const apiKey = 'test-api-key';

  beforeEach(() => {
    jest.resetModules(); 
    
    LiveMusicServiceModule = require('@services/LiveMusicService');
    LiveMusicService = LiveMusicServiceModule.LiveMusicService;
    DEFAULT_MUSIC_GENERATION_CONFIG = LiveMusicServiceModule.DEFAULT_MUSIC_GENERATION_CONFIG;

    jest.clearAllMocks(); // Clears all mocks, including call history of mockedLowLevelConnectInstance

    // Set up the specific implementation for mockedLowLevelConnectInstance for each test
    mockedLowLevelConnectInstance.mockImplementation(({ callbacks }) => {
      const sessionSpies = {
        play: jest.fn(),
        pause: jest.fn(),
        stop: jest.fn(),
        setWeightedPrompts: jest.fn(),
        setMusicGenerationConfig: jest.fn(),
      };
      
      let promiseResolve: (value: Partial<LiveMusicSession>) => void = () => {};
      let promiseReject: (reason?: any) => void = () => {};
      
      const promise = new Promise<Partial<LiveMusicSession>>((resolve, reject) => {
        promiseResolve = resolve;
        promiseReject = reject;
      });

      // Attach controllers to the promise object itself for easy retrieval in tests
      (promise as any)._controller = {
        resolve: () => promiseResolve(sessionSpies as Partial<LiveMusicSession>), // Resolve with the session spies
        reject: promiseReject,
        callbacks: callbacks,
        sessionSpies: sessionSpies,
      } as ConnectController;
      
      return promise;
    });
        
    audioContext = new (global.AudioContext as any)();
    mockDecodeAudioData.mockResolvedValue(mockAudioBuffer);
    mockGetCurrentDateAsSeed.mockReturnValue(12345);

    mockServiceCallbacks = {
      onPlaybackStateChange: jest.fn(),
      onFilteredPrompt: jest.fn(),
      onSetupComplete: jest.fn(),
      onError: jest.fn(),
      onClose: jest.fn(),
      onOutputNodeChanged: jest.fn(),
      onAudioBufferProcessed: jest.fn(),
    };
  });

  // Helper function to get the controller for the latest connect call
  const getLatestConnectController = (): ConnectController => {
    const results = mockedLowLevelConnectInstance.mock.results;
    if (results.length === 0) throw new Error("mockedLowLevelConnectInstance was not called");
    const lastResult = results[results.length - 1];
    if (lastResult.type !== 'return') throw new Error("Last call to mockedLowLevelConnectInstance did not return a promise");
    return (lastResult.value as any)._controller as ConnectController;
  };

  describe('Singleton Behavior', () => {
    it('getInstance() should throw an error if API key is not provided on first call', () => {
      expect(() => {
        LiveMusicService.getInstance('', audioContext, mockServiceCallbacks);
      }).toThrow("API_KEY is required to initialize LiveMusicService.");
    });

    it('getInstance() returns an instance if API key and other valid parameters are provided', () => {
      const instance = LiveMusicService.getInstance(apiKey, audioContext, mockServiceCallbacks);
      expect(instance).toBeInstanceOf(LiveMusicService);
    });
    
    it('getInstance() returns the same instance on a second call', () => {
      const instance1 = LiveMusicService.getInstance(apiKey, audioContext, mockServiceCallbacks);
      const instance2 = LiveMusicService.getInstance(apiKey, audioContext, mockServiceCallbacks);
      expect(instance1).toBe(instance2);
    });

    it('getInstance() returns original instance and warns if subsequent calls have different params', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      LiveMusicService.getInstance(apiKey, audioContext, mockServiceCallbacks); 
      const newAudioContext = new (global.AudioContext as any)() as AudioContext;
      LiveMusicService.getInstance('new-key', newAudioContext, mockServiceCallbacks); 
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "[LiveMusicService getInstance] An instance already exists. New parameters are being ignored."
      );
      consoleWarnSpy.mockRestore();
    });
  });

  describe('Connection and Setup Logic', () => {
    it('connect() calls ai.live.music.connect()', async () => {
      const service = LiveMusicService.getInstance(apiKey, audioContext, mockServiceCallbacks);
      const serviceConnectPromise = service.connect(); 
      
      expect(mockedLowLevelConnectInstance).toHaveBeenCalledTimes(1);
      const ctrl = getLatestConnectController();

      ctrl.resolve(ctrl.sessionSpies);
      await new Promise(resolve => setTimeout(resolve, 0));
      if (ctrl.callbacks && ctrl.callbacks.onmessage) {
        // Corrected AudioChunk mock to use string data
        await ctrl.callbacks.onmessage({ setupComplete: {}, audioChunk: { data: "" } }).catch(() => {});
      }
      try { await serviceConnectPromise; } catch (e) { /* Ignore */ }
    });

    it('connect() resolves and calls onSetupComplete after setupComplete message', async () => {
      const service = LiveMusicService.getInstance(apiKey, audioContext, mockServiceCallbacks);
      const connectPromise = service.connect();

      const ctrl = getLatestConnectController();
      ctrl.resolve(ctrl.sessionSpies);
      await new Promise(resolve => setTimeout(resolve, 0));

      // Corrected AudioChunk mock to use string data
      await ctrl.callbacks.onmessage({ setupComplete: {}, audioChunk: { data: "" } });

      await expect(connectPromise).resolves.toBeUndefined();
      expect(mockServiceCallbacks.onSetupComplete).toHaveBeenCalled();
    });

    it('connect() sends initial musicGenerationConfig after setupComplete', async () => {
      const initialConfig: Partial<LiveMusicGenerationConfig> = { bpm: 100, scale: LiveMusicServiceModule.Scale.D_MAJOR_B_MINOR };
      const service = LiveMusicService.getInstance(apiKey, audioContext, mockServiceCallbacks, initialConfig);
      const connectPromise = service.connect();

      const ctrl = getLatestConnectController();
      ctrl.resolve(ctrl.sessionSpies);
      await new Promise(resolve => setTimeout(resolve, 0));

      // Corrected AudioChunk mock to use string data
      await ctrl.callbacks.onmessage({ setupComplete: {}, audioChunk: { data: "" } });
      await connectPromise;

      const mergedConfig = { ...DEFAULT_MUSIC_GENERATION_CONFIG, ...initialConfig };
      const expectedConfigSentToSDK: Partial<LiveMusicGenerationConfig> = {};
      for (const key in mergedConfig) {
        if (mergedConfig[key as keyof LiveMusicGenerationConfig] !== undefined) {
          (expectedConfigSentToSDK as any)[key] = mergedConfig[key as keyof LiveMusicGenerationConfig];
        }
      }
      expect(ctrl.sessionSpies.setMusicGenerationConfig).toHaveBeenCalledWith({
         musicGenerationConfig: expectedConfigSentToSDK
      });
    });

    it('connect() rejects if ai.live.music.connect() rejects', async () => {
      const service = LiveMusicService.getInstance(apiKey, audioContext, mockServiceCallbacks);
      const connectPromise = service.connect();
      
      const ctrl = getLatestConnectController();
      const connectError = new Error('SDK_CONNECTION_FAILED_TEST_SPECIFIC'); // Unique error message
      ctrl.reject(connectError);
      
      await expect(connectPromise).rejects.toThrow('SDK_CONNECTION_FAILED_TEST_SPECIFIC');
      expect(mockServiceCallbacks.onError).toHaveBeenCalledWith('Connection failed: SDK_CONNECTION_FAILED_TEST_SPECIFIC');
    });

    it('connect() rejects if session calls onerror before setupComplete', async () => {
      const service = LiveMusicService.getInstance(apiKey, audioContext, mockServiceCallbacks);
      const connectPromise = service.connect();

      const ctrl = getLatestConnectController();
      ctrl.resolve(ctrl.sessionSpies);
      await new Promise(resolve => setTimeout(resolve, 0));

      const sessionError = new ErrorEvent('error', { message: 'SESSION_ERROR_BEFORE_SETUP_TEST_SPECIFIC' }); // Unique
      ctrl.callbacks.onerror(sessionError);
      
      await expect(connectPromise).rejects.toThrow('SESSION_ERROR_BEFORE_SETUP_TEST_SPECIFIC');
      expect(mockServiceCallbacks.onError).toHaveBeenCalledWith('Session error: SESSION_ERROR_BEFORE_SETUP_TEST_SPECIFIC');
    });

    it('connect() changes playback state to LOADING then PAUSED', async () => {
      const service = LiveMusicService.getInstance(apiKey, audioContext, mockServiceCallbacks);
      const connectPromise = service.connect();

      expect(mockServiceCallbacks.onPlaybackStateChange).toHaveBeenCalledWith(PlaybackState.LOADING);
      
      const ctrl = getLatestConnectController();
      ctrl.resolve(ctrl.sessionSpies);
      await new Promise(resolve => setTimeout(resolve, 0));
      // Corrected AudioChunk mock for this instance too
      await ctrl.callbacks.onmessage({ setupComplete: {}, audioChunk: { data: "" } });
      await connectPromise;

      expect(mockServiceCallbacks.onPlaybackStateChange).toHaveBeenCalledWith(PlaybackState.PAUSED);
    });
  });
});
