// @ts-nocheck
import { AudioEngineService } from '@services/AudioEngineService';
import { AudioContextService } from '@services/AudioContextService';
import { NativeNodeManager } from '@services/NativeNodeManager';
import { AudioWorkletManager } from '@services/AudioWorkletManager';
import { LyriaServiceManager } from '@services/LyriaServiceManager';
import { AudioGraphConnectorService } from '@services/AudioGraphConnectorService';
import { OutputDevice } from '@interfaces/common';

// Mock external services
jest.mock('@services/AudioContextService');
jest.mock('@services/NativeNodeManager');
jest.mock('@services/AudioWorkletManager');
jest.mock('@services/LyriaServiceManager');
jest.mock('@services/AudioGraphConnectorService');

// Mock global AudioContext and GainNode
const mockGainNode = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  gain: { value: 1 },
};

const mockAudioContext = {
  createGain: jest.fn(() => mockGainNode),
  close: jest.fn().mockResolvedValue(undefined),
  suspend: jest.fn().mockResolvedValue(undefined),
  resume: jest.fn().mockResolvedValue(undefined),
  destination: {}, // Mock destination object
  state: 'suspended' as AudioContextState,
  sampleRate: 44100,
  currentTime: 0,
  onstatechange: null as (() => void) | null,
  setSinkId: jest.fn().mockResolvedValue(undefined), // For setOutputDevice direct call if canChangeOutputDevice is false
};

describe('AudioEngineService', () => {
  let mockAudioContextServiceInstance: jest.Mocked<AudioContextService>;
  let mockNativeNodeManagerInstance: jest.Mocked<NativeNodeManager>;
  // let mockAudioWorkletManagerInstance: jest.Mocked<AudioWorkletManager>;
  // let mockLyriaServiceManagerInstance: jest.Mocked<LyriaServiceManager>;
  // let mockAudioGraphConnectorServiceInstance: jest.Mocked<AudioGraphConnectorService>;

  let activeMockAudioContext: any;


  beforeEach(() => {
    jest.clearAllMocks();

    activeMockAudioContext = { ...mockAudioContext, state: 'suspended' }; // Reset state for each test

    // Setup mock instances for constructors called within AudioEngineService
    mockAudioContextServiceInstance = new AudioContextService() as jest.Mocked<AudioContextService>;
    mockNativeNodeManagerInstance = new NativeNodeManager(jest.fn(), jest.fn()) as jest.Mocked<NativeNodeManager>;
    // mockAudioWorkletManagerInstance = new AudioWorkletManager(jest.fn(), jest.fn()) as jest.Mocked<AudioWorkletManager>;
    // mockLyriaServiceManagerInstance = new LyriaServiceManager(jest.fn()) as jest.Mocked<LyriaServiceManager>;
    // mockAudioGraphConnectorServiceInstance = new AudioGraphConnectorService() as jest.Mocked<AudioGraphConnectorService>;


    // Provide implementations for mocked service methods
    mockAudioContextServiceInstance.initialize = jest.fn().mockResolvedValue({ context: activeMockAudioContext });
    mockAudioContextServiceInstance.getAudioContext = jest.fn(() => activeMockAudioContext);
    mockAudioContextServiceInstance.setSinkId = jest.fn().mockResolvedValue(undefined);
    mockAudioContextServiceInstance.getAvailableOutputDevices = jest.fn().mockResolvedValue([
      { deviceId: 'default', label: 'Default', kind: 'audiooutput', groupId: 'default' } as OutputDevice,
    ]);
    mockAudioContextServiceInstance.canChangeOutputDevice = jest.fn(() => true); // Assume it can change by default

    // Link the mock instances to be returned by their constructors when AudioEngineService is created
    (AudioContextService as jest.Mock).mockImplementation(() => mockAudioContextServiceInstance);
    (NativeNodeManager as jest.Mock).mockImplementation(() => mockNativeNodeManagerInstance);
    (AudioWorkletManager as jest.Mock).mockImplementation(() => new AudioWorkletManager(jest.fn(), jest.fn()));
    (LyriaServiceManager as jest.Mock).mockImplementation(() => new LyriaServiceManager(jest.fn()));
    (AudioGraphConnectorService as jest.Mock).mockImplementation(() => new AudioGraphConnectorService());

  });

  describe('AudioContext Propagation to NativeNodeManager', () => {
    test('should call nativeNodeManager._setAudioContext with the new AudioContext on initialization', async () => {
      // Construction of AudioEngineService calls initializeBasicAudioContext
      const audioEngineService = new AudioEngineService();
      // Need to wait for async operations within initializeBasicAudioContext
      await Promise.resolve(); // Flushes microtask queue for async constructor logic
      await Promise.resolve();
      await Promise.resolve();


      expect(mockAudioContextServiceInstance.initialize).toHaveBeenCalled();
      expect(mockNativeNodeManagerInstance._setAudioContext).toHaveBeenCalledTimes(1);
      expect(mockNativeNodeManagerInstance._setAudioContext).toHaveBeenCalledWith(activeMockAudioContext);
    });

    test('should call nativeNodeManager._setAudioContext on setOutputDevice if context is valid', async () => {
      activeMockAudioContext.state = 'running'; // Ensure context is in a valid state
      mockAudioContextServiceInstance.initialize = jest.fn().mockResolvedValue({ context: activeMockAudioContext });
       mockAudioContextServiceInstance.getAudioContext = jest.fn(() => activeMockAudioContext);


      const audioEngineService = new AudioEngineService();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // Clear mock calls from initialization
      mockNativeNodeManagerInstance._setAudioContext.mockClear();

      await audioEngineService.setOutputDevice('some-sink-id');

      expect(mockAudioContextServiceInstance.setSinkId).toHaveBeenCalledWith('some-sink-id');
      // It's called once when getAudioContext() is called at the start of setOutputDevice
      expect(mockNativeNodeManagerInstance._setAudioContext).toHaveBeenCalledTimes(1);
      expect(mockNativeNodeManagerInstance._setAudioContext).toHaveBeenCalledWith(activeMockAudioContext);
    });

    test('should call nativeNodeManager._setAudioContext on setOutputDevice even if sinkId is the same (context fetched again)', async () => {
      activeMockAudioContext.state = 'running';
      mockAudioContextServiceInstance.initialize = jest.fn().mockResolvedValue({ context: activeMockAudioContext });
      mockAudioContextServiceInstance.getAudioContext = jest.fn(() => activeMockAudioContext);

      const audioEngineService = new AudioEngineService();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // Set initial sinkId (simulating it was already set)
      (audioEngineService as any)._selectedSinkId = 'current-sink-id';
      mockNativeNodeManagerInstance._setAudioContext.mockClear();

      await audioEngineService.setOutputDevice('current-sink-id'); // Calling with the same sinkId

      expect(mockAudioContextServiceInstance.setSinkId).toHaveBeenCalledWith('current-sink-id');
      expect(mockNativeNodeManagerInstance._setAudioContext).toHaveBeenCalledTimes(1);
      expect(mockNativeNodeManagerInstance._setAudioContext).toHaveBeenCalledWith(activeMockAudioContext);
    });


    test('should call nativeNodeManager._setAudioContext with null on dispose', async () => {
      activeMockAudioContext.state = 'running'; // Context needs to be closable
      mockAudioContextServiceInstance.initialize = jest.fn().mockResolvedValue({ context: activeMockAudioContext });

      const audioEngineService = new AudioEngineService();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // Clear mock calls from initialization
      mockNativeNodeManagerInstance._setAudioContext.mockClear();
      activeMockAudioContext.close.mockResolvedValue(undefined); // Ensure close is mockResolved for dispose

      audioEngineService.dispose();
      // Wait for close() promise to resolve if any
      await Promise.resolve();


      expect(activeMockAudioContext.close).toHaveBeenCalled();
      expect(mockNativeNodeManagerInstance._setAudioContext).toHaveBeenCalledTimes(1);
      expect(mockNativeNodeManagerInstance._setAudioContext).toHaveBeenCalledWith(null);
    });

    test('should still call nativeNodeManager._setAudioContext with null on dispose even if context was already null', async () => {
      // Simulate a scenario where context was never initialized or already null
      activeMockAudioContext = null;
      mockAudioContextServiceInstance.initialize = jest.fn().mockResolvedValue({ context: null });
      mockAudioContextServiceInstance.getAudioContext = jest.fn(() => null);


      const audioEngineService = new AudioEngineService();
       // Construction of AudioEngineService calls initializeBasicAudioContext
      // which might try to set it based on a null context initially.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // It would have been called with null during the failed initialization
      // expect(mockNativeNodeManagerInstance._setAudioContext).toHaveBeenCalledWith(null);
      mockNativeNodeManagerInstance._setAudioContext.mockClear();


      audioEngineService.dispose();
      await Promise.resolve();

      expect(mockNativeNodeManagerInstance._setAudioContext).toHaveBeenCalledTimes(1);
      expect(mockNativeNodeManagerInstance._setAudioContext).toHaveBeenCalledWith(null);
    });

    test('should call nativeNodeManager._setAudioContext when a new context is created by initializeBasicAudioContext after a previous one was closed', async () => {
      // Initial setup
      const firstAudioContext = { ...mockAudioContext, state: 'running', id: 'first' };
      mockAudioContextServiceInstance.initialize = jest.fn().mockResolvedValue({ context: firstAudioContext });

      const audioEngineService = new AudioEngineService();
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

      expect(mockNativeNodeManagerInstance._setAudioContext).toHaveBeenCalledWith(firstAudioContext);
      mockNativeNodeManagerInstance._setAudioContext.mockClear();

      // Simulate the context being closed (e.g., by an external event or error)
      firstAudioContext.state = 'closed';
      if (firstAudioContext.onstatechange) {
        firstAudioContext.onstatechange(); // Trigger state change logic if any
      }
      (audioEngineService as any)._audioContext = null; // Simulate it being nulled out

      // Now, setup initialize to return a new AudioContext
      const secondAudioContext = { ...mockAudioContext, state: 'suspended', id: 'second' };
      mockAudioContextServiceInstance.initialize = jest.fn().mockResolvedValue({ context: secondAudioContext });

      // Manually call initializeBasicAudioContext again
      await audioEngineService.initializeBasicAudioContext();
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();


      expect(mockNativeNodeManagerInstance._setAudioContext).toHaveBeenCalledTimes(1);
      expect(mockNativeNodeManagerInstance._setAudioContext).toHaveBeenCalledWith(secondAudioContext);
    });
  });
});
