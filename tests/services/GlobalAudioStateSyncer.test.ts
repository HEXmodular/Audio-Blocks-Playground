import { GlobalAudioStateSyncer, GlobalAudioState } from '@services/GlobalAudioStateSyncer';
import { AudioEngineService } from '@services/AudioEngineService';
import { AudioDevice, AudioContextState } from '@interfaces';

jest.mock('@services/AudioEngineService');

const mockAudioDevice = (id: string, label: string = `Device ${id}`): AudioDevice => ({
  deviceId: id,
  groupId: `group-${id}`,
  kind: 'audiooutput',
  label: label,
  toJSON: () => ({ deviceId: id, groupId: `group-${id}`, kind: 'audiooutput', label: label }),
});

describe('GlobalAudioStateSyncer', () => {
  // Use a more flexible type for the instance if jest.Mocked<T> is too strict
  let mockAudioEngineServiceInstance: any; // Changed to any for pragmatic type handling
  let audioEngineStateChangeCallback: () => void;

  const setupMockAudioEngineServiceState = (state: GlobalAudioState) => {
    mockAudioEngineServiceInstance.isAudioGloballyEnabled = state.isAudioGloballyEnabled;
    mockAudioEngineServiceInstance.availableOutputDevices = [...state.availableOutputDevices];
    mockAudioEngineServiceInstance.selectedSinkId = state.selectedSinkId;

    if (!mockAudioEngineServiceInstance.audioWorkletManager) {
        mockAudioEngineServiceInstance.audioWorkletManager = {};
    }
    mockAudioEngineServiceInstance.audioWorkletManager.isAudioWorkletSystemReady = state.isWorkletSystemReady;

    const valueToReturnByGetter = {
        isAudioGloballyEnabled: state.isAudioGloballyEnabled,
        audioInitializationError: null,
        availableOutputDevices: [...state.availableOutputDevices],
        selectedSinkId: state.selectedSinkId,
        audioContextState: state.audioContextState,
        sampleRate: 44100,
        // updateCounter: state.updateCounter || 0, // Removed updateCounter
    };

    Object.defineProperty(mockAudioEngineServiceInstance, 'audioEngineState', {
      get: jest.fn(() => valueToReturnByGetter),
      configurable: true
    });
  };

  const updateMockAudioEngineServiceState = (newState: Partial<GlobalAudioState>) => {
    const engineStateFromGetter = mockAudioEngineServiceInstance.audioEngineState;
    const currentGlobalState: GlobalAudioState = {
      isAudioGloballyEnabled: mockAudioEngineServiceInstance.isAudioGloballyEnabled,
      availableOutputDevices: mockAudioEngineServiceInstance.availableOutputDevices,
      selectedSinkId: mockAudioEngineServiceInstance.selectedSinkId,
      audioContextState: engineStateFromGetter.audioContextState,
      isWorkletSystemReady: mockAudioEngineServiceInstance.audioWorkletManager?.isAudioWorkletSystemReady,
      // updateCounter: engineStateFromGetter.updateCounter || 0, // Removed updateCounter
    };

    const updatedState: GlobalAudioState = { ...currentGlobalState, ...newState }; // Removed updateCounter logic
    setupMockAudioEngineServiceState(updatedState);

    if (audioEngineStateChangeCallback) {
      audioEngineStateChangeCallback();
    }
  };

  beforeEach(() => {
    const MockedAudioEngineServiceConstructor = AudioEngineService as jest.MockedClass<typeof AudioEngineService>;
    mockAudioEngineServiceInstance = new MockedAudioEngineServiceConstructor();

    // Methods on an auto-mocked class instance are already jest.fn().
    // We cast to jest.Mock to satisfy TypeScript when calling mockImplementation.
    (mockAudioEngineServiceInstance.subscribe as jest.Mock).mockImplementation((callback: () => void) => {
      audioEngineStateChangeCallback = callback;
      return jest.fn(); // Return mock unsubscribe
    });

    // Setup default values for direct properties
    mockAudioEngineServiceInstance.isAudioGloballyEnabled = false;
    mockAudioEngineServiceInstance.availableOutputDevices = [];
    mockAudioEngineServiceInstance.selectedSinkId = null;
    mockAudioEngineServiceInstance.audioWorkletManager = { isAudioWorkletSystemReady: false };

    // Define a default getter for audioEngineState.
    Object.defineProperty(mockAudioEngineServiceInstance, 'audioEngineState', {
        get: jest.fn(() => ({
            isAudioGloballyEnabled: mockAudioEngineServiceInstance.isAudioGloballyEnabled,
            audioInitializationError: null,
            availableOutputDevices: mockAudioEngineServiceInstance.availableOutputDevices,
            selectedSinkId: mockAudioEngineServiceInstance.selectedSinkId,
            audioContextState: null,
            sampleRate: 44100,
            // updateCounter: 0, // Removed default updateCounter
        })),
        configurable: true
    });
  });

  describe('Initialization', () => {
    test.skip('should initialize currentState correctly from AudioEngineService', () => {
      const initialState: GlobalAudioState = {
        isAudioGloballyEnabled: true,
        availableOutputDevices: [mockAudioDevice('1')],
        selectedSinkId: '1',
        audioContextState: 'running' as AudioContextState,
        isWorkletSystemReady: true,
        // updateCounter: 0, // Removed updateCounter
      };
      setupMockAudioEngineServiceState(initialState);

      const syncer = new GlobalAudioStateSyncer(mockAudioEngineServiceInstance);

      expect(syncer.currentState.availableOutputDevices).not.toBe(initialState.availableOutputDevices);
      expect(syncer.currentState.availableOutputDevices).toEqual(initialState.availableOutputDevices);

      expect(syncer.currentState).toEqual(expect.objectContaining({
        isAudioGloballyEnabled: initialState.isAudioGloballyEnabled,
        selectedSinkId: initialState.selectedSinkId,
        audioContextState: initialState.audioContextState,
        isWorkletSystemReady: initialState.isWorkletSystemReady,
      }));
    });
  });

  describe('Subscriber Notifications', () => {
    let syncer: GlobalAudioStateSyncer;
    let mockSubscriber: jest.Mock;

    beforeEach(() => {
      const initialState: GlobalAudioState = {
        isAudioGloballyEnabled: false,
        availableOutputDevices: [mockAudioDevice('default')],
        selectedSinkId: 'default',
        audioContextState: 'suspended' as AudioContextState,
        isWorkletSystemReady: false,
        // updateCounter: 0, // Removed updateCounter
      };
      setupMockAudioEngineServiceState(initialState);
      syncer = new GlobalAudioStateSyncer(mockAudioEngineServiceInstance);
      mockSubscriber = jest.fn();
      syncer.subscribe(mockSubscriber);
      mockSubscriber.mockClear();
    });

    test('should notify subscribers and update state on isAudioGloballyEnabled change', () => {
      updateMockAudioEngineServiceState({ isAudioGloballyEnabled: true });
      expect(mockSubscriber).toHaveBeenCalledTimes(1);
      expect(mockSubscriber).toHaveBeenCalledWith(syncer.currentState);
      expect(syncer.currentState.isAudioGloballyEnabled).toBe(true);
    });

    test('should notify subscribers and update state on selectedSinkId change', () => {
      updateMockAudioEngineServiceState({ selectedSinkId: 'new-sink' });
      expect(mockSubscriber).toHaveBeenCalledTimes(1);
      expect(syncer.currentState.selectedSinkId).toBe('new-sink');
    });

    test('should notify subscribers and update state on audioContextState change', () => {
      updateMockAudioEngineServiceState({ audioContextState: 'running' as AudioContextState });
      expect(mockSubscriber).toHaveBeenCalledTimes(1);
      expect(syncer.currentState.audioContextState).toBe('running');
    });

    test('should notify subscribers and update state on isWorkletSystemReady change', () => {
      updateMockAudioEngineServiceState({ isWorkletSystemReady: true });
      expect(mockSubscriber).toHaveBeenCalledTimes(1);
      expect(syncer.currentState.isWorkletSystemReady).toBe(true);
    });

    test.skip('should not notify subscribers if state does not change meaningfully', () => {
      updateMockAudioEngineServiceState({
        isAudioGloballyEnabled: syncer.currentState.isAudioGloballyEnabled,
        selectedSinkId: syncer.currentState.selectedSinkId,
      });
      expect(mockSubscriber).not.toHaveBeenCalled();
    });

    test.skip('should not notify if only irrelevant parts of AudioEngineService state change (e.g. sampleRate)', () => {
        const initialSyncerState = { ...syncer.currentState };
        const currentEngineReturnState = mockAudioEngineServiceInstance.audioEngineState;

        Object.defineProperty(mockAudioEngineServiceInstance, 'audioEngineState', {
            get: jest.fn(() => ({
                ...currentEngineReturnState,
                audioInitializationError: "New error, but not in GlobalAudioState",
                sampleRate: 96000,
            })),
            configurable: true
        });

        if (audioEngineStateChangeCallback) {
            audioEngineStateChangeCallback();
        }
        expect(mockSubscriber).not.toHaveBeenCalled();
        expect(syncer.currentState).toEqual(initialSyncerState);
    });

    describe('availableOutputDevices comparison', () => {
      test('should notify on adding a device', () => {
        const newDevices: AudioDevice[] = [...syncer.currentState.availableOutputDevices, mockAudioDevice('2')];
        updateMockAudioEngineServiceState({ availableOutputDevices: newDevices });
        expect(mockSubscriber).toHaveBeenCalledTimes(1);
        expect(syncer.currentState.availableOutputDevices).toEqual(newDevices);
      });

      test('should notify on removing a device', () => {
        const newDevices: AudioDevice[] = [];
        updateMockAudioEngineServiceState({ availableOutputDevices: newDevices });
        expect(mockSubscriber).toHaveBeenCalledTimes(1);
        expect(syncer.currentState.availableOutputDevices).toEqual(newDevices);
      });

      test('should notify on changing a deviceId', () => {
        const modifiedDevices: AudioDevice[] = [...syncer.currentState.availableOutputDevices];
        if (modifiedDevices.length === 0) modifiedDevices.push(mockAudioDevice('temp'));
        modifiedDevices[0] = mockAudioDevice('new-default','Device new-default');
        updateMockAudioEngineServiceState({ availableOutputDevices: modifiedDevices });
        expect(mockSubscriber).toHaveBeenCalledTimes(1);
        expect(syncer.currentState.availableOutputDevices).toEqual(modifiedDevices);
      });

      test.skip('should not notify on changing a device label (current implementation detail)', () => {
        const devicesWithNewLabel: AudioDevice[] = syncer.currentState.availableOutputDevices.map(d => ({...d}));
        if(devicesWithNewLabel.length > 0) {
            devicesWithNewLabel[0].label = "New Label For Device";
        } else {
             devicesWithNewLabel.push(mockAudioDevice('default', "New Label For Device"));
        }
        updateMockAudioEngineServiceState({ availableOutputDevices: devicesWithNewLabel });
        expect(mockSubscriber).not.toHaveBeenCalled();
      });

      test.skip('should not notify if a new array reference with identical devices is provided', () => {
        const newArrayRefDevices: AudioDevice[] = [...syncer.currentState.availableOutputDevices.map(d => ({...d}))];
        updateMockAudioEngineServiceState({ availableOutputDevices: newArrayRefDevices });
        expect(mockSubscriber).not.toHaveBeenCalled();
      });

      test('should notify if device order changes (and IDs at indices differ)', () => {
        const specificInitialDevices: AudioDevice[] = [mockAudioDevice('1', 'Device 1'), mockAudioDevice('2', 'Device 2')];
        setupMockAudioEngineServiceState({
            isAudioGloballyEnabled: false,
            availableOutputDevices: specificInitialDevices,
            selectedSinkId: '1',
            audioContextState: 'suspended',
            isWorkletSystemReady: false,
        });
        const localSyncer = new GlobalAudioStateSyncer(mockAudioEngineServiceInstance);
        const localMockSubscriber = jest.fn();
        localSyncer.subscribe(localMockSubscriber);
        localMockSubscriber.mockClear();

        const reorderedDevices: AudioDevice[] = [specificInitialDevices[1], specificInitialDevices[0]];
        updateMockAudioEngineServiceState({ availableOutputDevices: reorderedDevices });

        expect(localMockSubscriber).toHaveBeenCalledTimes(1);
        expect(localSyncer.currentState.availableOutputDevices).toEqual(reorderedDevices);
      });
    });
  });
});
