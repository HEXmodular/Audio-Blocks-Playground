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
  let activeMockAudioContext: any;

  beforeEach(() => {
    jest.clearAllMocks();
    activeMockAudioContext = { ...mockAudioContext, state: 'suspended' };

    mockAudioContextServiceInstance = new AudioContextService() as jest.Mocked<AudioContextService>;
    mockNativeNodeManagerInstance = new NativeNodeManager(null as any, jest.fn()) as jest.Mocked<NativeNodeManager>;

    const mockAudioWorkletManagerInstance = {
      _setAudioContext: jest.fn(),
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

    mockNativeNodeManagerInstance.removeAllManagedNativeNodes = jest.fn();

    mockAudioContextServiceInstance.initialize = jest.fn().mockResolvedValue({ context: activeMockAudioContext });
    mockAudioContextServiceInstance.getAudioContext = jest.fn(() => activeMockAudioContext);
    mockAudioContextServiceInstance.setSinkId = jest.fn().mockResolvedValue(undefined);
    mockAudioContextServiceInstance.getAvailableOutputDevices = jest.fn().mockResolvedValue([
      { deviceId: 'default', label: 'Default', kind: 'audiooutput', groupId: 'default' } as OutputDevice,
    ]);
    mockAudioContextServiceInstance.canChangeOutputDevice = jest.fn(() => true);

    (AudioContextService as jest.Mock).mockImplementation(() => mockAudioContextServiceInstance);
    (NativeNodeManager as jest.Mock).mockImplementation(() => mockNativeNodeManagerInstance);
    (AudioWorkletManager as jest.Mock).mockImplementation(() => mockAudioWorkletManagerInstance);
    (LyriaServiceManager as jest.Mock).mockImplementation(() => mockLyriaServiceManagerInstance);
    (AudioGraphConnectorService as jest.Mock).mockImplementation(() => mockAudioGraphConnectorServiceInstance);
  });

  describe('AudioContext Propagation to NativeNodeManager', () => {
    test('should call nativeNodeManager._setAudioContext with the new AudioContext on initialization', async () => {
      const audioEngineService = new AudioEngineService();
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      expect(mockAudioContextServiceInstance.initialize).toHaveBeenCalled();
      expect(mockNativeNodeManagerInstance._setAudioContext).toHaveBeenCalledTimes(2); // Corrected
      expect(mockNativeNodeManagerInstance._setAudioContext).toHaveBeenCalledWith(activeMockAudioContext);
    });

    test('should call nativeNodeManager._setAudioContext on setOutputDevice if context is valid', async () => {
      activeMockAudioContext.state = 'running';
      mockAudioContextServiceInstance.initialize = jest.fn().mockResolvedValue({ context: activeMockAudioContext });
      mockAudioContextServiceInstance.getAudioContext = jest.fn(() => activeMockAudioContext);

      const audioEngineService = new AudioEngineService();
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      mockNativeNodeManagerInstance._setAudioContext.mockClear();
      await audioEngineService.setOutputDevice('some-sink-id');
      expect(mockAudioContextServiceInstance.setSinkId).toHaveBeenCalledWith('some-sink-id');
      expect(mockNativeNodeManagerInstance._setAudioContext).toHaveBeenCalledTimes(1);
      expect(mockNativeNodeManagerInstance._setAudioContext).toHaveBeenCalledWith(activeMockAudioContext);
    });

    test('should call nativeNodeManager._setAudioContext on setOutputDevice even if sinkId is the same (context fetched again)', async () => {
      activeMockAudioContext.state = 'running';
      mockAudioContextServiceInstance.initialize = jest.fn().mockResolvedValue({ context: activeMockAudioContext });
      mockAudioContextServiceInstance.getAudioContext = jest.fn(() => activeMockAudioContext);

      const audioEngineService = new AudioEngineService();
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      (audioEngineService as any)._selectedSinkId = 'current-sink-id';
      mockNativeNodeManagerInstance._setAudioContext.mockClear();
      await audioEngineService.setOutputDevice('current-sink-id');
      expect(mockAudioContextServiceInstance.setSinkId).toHaveBeenCalledWith('current-sink-id');
      expect(mockNativeNodeManagerInstance._setAudioContext).toHaveBeenCalledTimes(1); // This was 2, but after mockClear, setOutputDevice calls it once.
      expect(mockNativeNodeManagerInstance._setAudioContext).toHaveBeenCalledWith(activeMockAudioContext);
    });

    test('should call nativeNodeManager._setAudioContext with null on dispose', async () => {
      activeMockAudioContext.state = 'running';
      mockAudioContextServiceInstance.initialize = jest.fn().mockResolvedValue({ context: activeMockAudioContext });
      const audioEngineService = new AudioEngineService();
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      mockNativeNodeManagerInstance._setAudioContext.mockClear();
      activeMockAudioContext.close.mockResolvedValue(undefined);
      audioEngineService.dispose();
      await Promise.resolve();
      expect(activeMockAudioContext.close).toHaveBeenCalled();
      expect(mockNativeNodeManagerInstance._setAudioContext).toHaveBeenCalledTimes(1);
      expect(mockNativeNodeManagerInstance._setAudioContext).toHaveBeenCalledWith(null);
    });

    test('should still call nativeNodeManager._setAudioContext with null on dispose even if context was already null', async () => {
      mockAudioContextServiceInstance.initialize = jest.fn().mockResolvedValue({ context: { ...mockAudioContext, state: 'closed' } });
      mockAudioContextServiceInstance.getAudioContext = jest.fn(() => null);
      const audioEngineService = new AudioEngineService();
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      (audioEngineService as any)._audioContext = null;
      mockNativeNodeManagerInstance._setAudioContext.mockClear();
      audioEngineService.dispose();
      await Promise.resolve();
      expect(mockNativeNodeManagerInstance._setAudioContext).toHaveBeenCalledTimes(1);
      expect(mockNativeNodeManagerInstance._setAudioContext).toHaveBeenCalledWith(null);
    });

    test('should call nativeNodeManager._setAudioContext when a new context is created by initializeBasicAudioContext after a previous one was closed', async () => {
      const firstAudioContext = { ...mockAudioContext, state: 'running', id: 'first' };
      mockAudioContextServiceInstance.initialize = jest.fn().mockResolvedValue({ context: firstAudioContext });
      const audioEngineService = new AudioEngineService();
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      expect(mockNativeNodeManagerInstance._setAudioContext).toHaveBeenCalledWith(firstAudioContext);
      mockNativeNodeManagerInstance._setAudioContext.mockClear();
      firstAudioContext.state = 'closed';
      if (firstAudioContext.onstatechange) firstAudioContext.onstatechange();
      (audioEngineService as any)._audioContext = null;
      const secondAudioContext = { ...mockAudioContext, state: 'suspended', id: 'second' };
      mockAudioContextServiceInstance.initialize = jest.fn().mockResolvedValue({ context: secondAudioContext });
      await audioEngineService.initializeBasicAudioContext();
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      expect(mockNativeNodeManagerInstance._setAudioContext).toHaveBeenCalledTimes(2); // Corrected
      expect(mockNativeNodeManagerInstance._setAudioContext).toHaveBeenCalledWith(secondAudioContext);
    });
  });
});
