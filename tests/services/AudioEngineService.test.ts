// @ts-nocheck
import { AudioEngineService } from '@services/AudioEngineService';
import { AudioContextService } from '@services/AudioContextService';
import AudioNodeManager from '@services/AudioNodeManager'; // Changed from NativeNodeManager
import { AudioWorkletManager } from '@services/AudioWorkletManager';
import { LyriaServiceManager } from '@services/LyriaServiceManager';
import { AudioGraphConnectorService } from '@services/AudioGraphConnectorService';
import { OutputDevice } from '@interfaces/common';

// Mock external services
jest.mock('@services/AudioContextService');
jest.mock('@services/AudioNodeManager'); // Changed from NativeNodeManager
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
  let mockAudioNodeManagerInstance: jest.Mocked<AudioNodeManager>; // Changed type
  let activeMockAudioContext: any;

  beforeEach(() => {
    jest.clearAllMocks();
    activeMockAudioContext = { ...mockAudioContext, state: 'suspended' };

    mockAudioContextServiceInstance = new AudioContextService() as jest.Mocked<AudioContextService>;
    // mockAudioNodeManagerInstance will be initialized using AudioNodeManager.getInstance()
    // due to the module mock. We will then ensure its methods are jest.fn()
    mockAudioNodeManagerInstance = AudioNodeManager.getInstance() as jest.Mocked<AudioNodeManager>;

    // Ensure the methods we expect to call on mockAudioNodeManagerInstance are jest.fn()
    // This is important because the actual instance from AudioNodeManager.getInstance() won't have jest mock features unless we define them.
    // However, jest.mock('@services/AudioNodeManager') should ideally auto-mock its methods.
    // If not, we'd do it manually, e.g., mockAudioNodeManagerInstance.setAudioContext = jest.fn();
    // For now, let's assume the module mock handles making methods mockable.
    // If tests fail, this is the area to revisit.

    const mockAudioWorkletManagerInstance = {
      setAudioContext: jest.fn(), // Assuming public method is setAudioContext
      registerWorkletDefinition: jest.fn(),
      checkAndRegisterPredefinedWorklets: jest.fn().mockResolvedValue(true),
      setIsAudioWorkletSystemReady: jest.fn(),
      isAudioWorkletSystemReady: true,
      getManagedNodesMap: jest.fn(() => new Map()),
      removeAllManagedWorkletNodes: jest.fn(),
    } as jest.Mocked<AudioWorkletManager>;

    const mockLyriaServiceManagerInstance = {
      _setAudioContextAndMasterGain: jest.fn(),
      getManagedInstancesMap: jest.fn(() => new Map()),
      removeAllManagedLyriaServices: jest.fn(),
    } as jest.Mocked<LyriaServiceManager>;

    const mockAudioGraphConnectorServiceInstance = {
      updateConnections: jest.fn(),
      disconnectAll: jest.fn(),
    } as jest.Mocked<AudioGraphConnectorService>;

    // removeAllManagedNativeNodes is now part of AudioNodeManager's own methods.
    // If AudioEngineService was calling it directly on NativeNodeManager instance, that call is gone.
    // If it was a static call, it's also different.
    // The method removeAllManagedNativeNodes is public on AudioNodeManager.
    // If the test needs to assert it's called, it would be on mockAudioNodeManagerInstance.
    // For now, let's assume no direct assertion on this from AudioEngineService tests, unless it was a passthrough.
    // Based on AudioEngineService source, it does not directly call removeAllManagedNativeNodes.
    // NativeNodeManager.setAudioContext -> AudioNodeManager.setAudioContext (instance method)
    // NativeNodeManager.removeAllManagedNativeNodes -> AudioNodeManager.removeAllManagedNativeNodes (instance method, called by setAudioContext)

    mockAudioContextServiceInstance.initialize = jest.fn().mockResolvedValue({ context: activeMockAudioContext });
    mockAudioContextServiceInstance.getAudioContext = jest.fn(() => activeMockAudioContext);
    mockAudioContextServiceInstance.setSinkId = jest.fn().mockResolvedValue(undefined);
    mockAudioContextServiceInstance.getAvailableOutputDevices = jest.fn().mockResolvedValue([
      { deviceId: 'default', label: 'Default', kind: 'audiooutput', groupId: 'default' } as OutputDevice,
    ]);
    mockAudioContextServiceInstance.canChangeOutputDevice = jest.fn(() => true);

    (AudioContextService as jest.Mock).mockImplementation(() => mockAudioContextServiceInstance);
    // The module AudioNodeManager is already mocked. Its getInstance() will return the auto-mocked instance.
    // We stored this in mockAudioNodeManagerInstance.
    // No need to mockImplementation for AudioNodeManager itself here if getInstance() is correctly handled by the top-level mock.
    (AudioWorkletManager as jest.Mock).mockImplementation(() => mockAudioWorkletManagerInstance);
    (LyriaServiceManager as jest.Mock).mockImplementation(() => mockLyriaServiceManagerInstance);
    (AudioGraphConnectorService as jest.Mock).mockImplementation(() => mockAudioGraphConnectorServiceInstance);
  });

  describe('AudioContext Propagation to AudioNodeManager', () => { // Changed describe title
    test('should call audioNodeManager.setAudioContext with the new AudioContext on initialization', async () => {
      const audioEngineService = new AudioEngineService();
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); // For async operations in constructor/init
      expect(mockAudioContextServiceInstance.initialize).toHaveBeenCalled();
      // AudioEngineService.initialize calls AudioNodeManager.setAudioContext
      // The constructor of AudioEngineService might also trigger something if it calls initialize implicitly or sets context.
      // Based on current AudioEngineService, initialize() is explicit.
      // Let's assume AudioNodeManager.setAudioContext is called once during AudioEngineService.initialize()
      expect(mockAudioNodeManagerInstance.setAudioContext).toHaveBeenCalledTimes(1);
      expect(mockAudioNodeManagerInstance.setAudioContext).toHaveBeenCalledWith(activeMockAudioContext);
    });

    test('should call audioNodeManager.setAudioContext on setOutputDevice if context is valid', async () => {
      activeMockAudioContext.state = 'running';
      mockAudioContextServiceInstance.initialize = jest.fn().mockResolvedValue({ context: activeMockAudioContext });
      mockAudioContextServiceInstance.getAudioContext = jest.fn(() => activeMockAudioContext);

      const audioEngineService = new AudioEngineService();
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      // Clear mocks from initialization
      if (mockAudioNodeManagerInstance.setAudioContext.mockClear) mockAudioNodeManagerInstance.setAudioContext.mockClear();

      await audioEngineService.setOutputDevice('some-sink-id');
      expect(mockAudioContextServiceInstance.setSinkId).toHaveBeenCalledWith('some-sink-id');
      // setOutputDevice in AudioEngineService calls this.initialize -> AudioNodeManager.setAudioContext
      expect(mockAudioNodeManagerInstance.setAudioContext).toHaveBeenCalledTimes(1);
      expect(mockAudioNodeManagerInstance.setAudioContext).toHaveBeenCalledWith(activeMockAudioContext);
    });

    test('should call audioNodeManager.setAudioContext on setOutputDevice even if sinkId is the same', async () => {
      activeMockAudioContext.state = 'running';
      mockAudioContextServiceInstance.initialize = jest.fn().mockResolvedValue({ context: activeMockAudioContext });
      mockAudioContextServiceInstance.getAudioContext = jest.fn(() => activeMockAudioContext);

      const audioEngineService = new AudioEngineService();
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      (audioEngineService as any)._selectedSinkId = 'current-sink-id'; // Simulate existing sinkId
      if (mockAudioNodeManagerInstance.setAudioContext.mockClear) mockAudioNodeManagerInstance.setAudioContext.mockClear();

      await audioEngineService.setOutputDevice('current-sink-id');
      expect(mockAudioContextServiceInstance.setSinkId).toHaveBeenCalledWith('current-sink-id');
      expect(mockAudioNodeManagerInstance.setAudioContext).toHaveBeenCalledTimes(1);
      expect(mockAudioNodeManagerInstance.setAudioContext).toHaveBeenCalledWith(activeMockAudioContext);
    });

    test('should call audioNodeManager.setAudioContext with null on dispose', async () => {
      activeMockAudioContext.state = 'running';
      mockAudioContextServiceInstance.initialize = jest.fn().mockResolvedValue({ context: activeMockAudioContext });
      const audioEngineService = new AudioEngineService();
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      if (mockAudioNodeManagerInstance.setAudioContext.mockClear) mockAudioNodeManagerInstance.setAudioContext.mockClear();

      activeMockAudioContext.close.mockResolvedValue(undefined); // Mock AudioContext.close
      audioEngineService.dispose(); // AudioEngineService.dispose calls this.context.close() and then sets managers' contexts to null
      await Promise.resolve(); // For async operations in dispose

      expect(activeMockAudioContext.close).toHaveBeenCalled();
      // dispose() in AudioEngineService calls AudioNodeManager.setAudioContext(null)
      expect(mockAudioNodeManagerInstance.setAudioContext).toHaveBeenCalledTimes(1);
      expect(mockAudioNodeManagerInstance.setAudioContext).toHaveBeenCalledWith(null);
    });

    test('should still call audioNodeManager.setAudioContext with null on dispose even if context was already null', async () => {
      mockAudioContextServiceInstance.initialize = jest.fn().mockResolvedValue({ context: { ...mockAudioContext, state: 'closed' } });
      mockAudioContextServiceInstance.getAudioContext = jest.fn(() => null); // Context is null
      const audioEngineService = new AudioEngineService();
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      (audioEngineService as any)._audioContext = null; // Ensure internal context is null
      if (mockAudioNodeManagerInstance.setAudioContext.mockClear) mockAudioNodeManagerInstance.setAudioContext.mockClear();

      audioEngineService.dispose();
      await Promise.resolve();
      expect(mockAudioNodeManagerInstance.setAudioContext).toHaveBeenCalledTimes(1);
      expect(mockAudioNodeManagerInstance.setAudioContext).toHaveBeenCalledWith(null);
    });

    test('should call audioNodeManager.setAudioContext when a new context is created by initializeBasicAudioContext', async () => {
      const firstAudioContext = { ...mockAudioContext, state: 'running', id: 'first' };
      mockAudioContextServiceInstance.initialize = jest.fn().mockResolvedValue({ context: firstAudioContext });
      const audioEngineService = new AudioEngineService();
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); // for initial init
      expect(mockAudioNodeManagerInstance.setAudioContext).toHaveBeenCalledWith(firstAudioContext);

      if (mockAudioNodeManagerInstance.setAudioContext.mockClear) mockAudioNodeManagerInstance.setAudioContext.mockClear();
      firstAudioContext.state = 'closed'; // Simulate context closed
      if (firstAudioContext.onstatechange) firstAudioContext.onstatechange(); // Trigger state change if any
      (audioEngineService as any)._audioContext = null; // Reflect context is gone

      const secondAudioContext = { ...mockAudioContext, state: 'suspended', id: 'second' };
      mockAudioContextServiceInstance.initialize = jest.fn().mockResolvedValue({ context: secondAudioContext }); // Next init provides new context

      await audioEngineService.initializeBasicAudioContext(); // This calls initialize()
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); // for this new init

      // initializeBasicAudioContext -> initialize -> AudioNodeManager.setAudioContext
      expect(mockAudioNodeManagerInstance.setAudioContext).toHaveBeenCalledTimes(1);
      expect(mockAudioNodeManagerInstance.setAudioContext).toHaveBeenCalledWith(secondAudioContext);
    });
  });
});
