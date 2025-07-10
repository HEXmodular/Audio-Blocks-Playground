import { BlockStateManager, InstanceUpdatePayload } from '@state/BlockStateManager';
import { BlockDefinition, BlockInstance } from '@interfaces/common'; // Added BlockInstance
// import { AUDIO_OUTPUT_BLOCK_DEFINITION } from '@constants/constants'; // CORE_BLOCK_DEFINITIONS_ARRAY removed for mocking - Removed
// import { AudioEngineService } from '../../services/AudioEngineService'; // No longer needed for getAudioOutputDefinition
import { AudioOutputBlock } from '@blocks/native-blocks/AudioOutputBlock'; // Changed path

// Minimal mock for CORE_BLOCK_DEFINITIONS_ARRAY to avoid import issues in test
const MOCK_CORE_BLOCK_DEFINITIONS_ARRAY: BlockDefinition[] = [
  AudioOutputBlock.getDefinition(), // Changed
  // Add any other essential definitions if their structure is specifically needed by BSM constructor logic beyond just being an array.
  // For these tests, primarily focusing on save/load mechanics, a simple array with one item should suffice.
];

// Mock an initial set of definitions for the constructor to load, if not clearing localStorage
const initialDefinitionsForTestLoad = [...MOCK_CORE_BLOCK_DEFINITIONS_ARRAY];

jest.useFakeTimers();

// Mock localStorage
let mockLocalStorageStore: { [key: string]: string } = {};

const mockLocalStorage = {
  getItem: jest.fn((key: string) => mockLocalStorageStore[key] || null),
  setItem: jest.fn((key: string, value: string) => {
    mockLocalStorageStore[key] = value;
  }),
  removeItem: jest.fn((key: string) => {
    delete mockLocalStorageStore[key];
  }),
  clear: jest.fn(() => {
    mockLocalStorageStore = {};
  }),
  key: jest.fn(),
  length: 0,
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
});


describe('BlockStateManager Debouncing and Batching', () => {
  let onDefinitionsChangeCallback: jest.Mock;
  let onInstancesChangeCallback: jest.Mock;
  const DEBOUNCE_WAIT_MS = 300; // Matching the value in BlockStateManager.ts

  beforeEach(() => {
    // Clear all mocks and timers before each test
    jest.clearAllMocks();
    jest.clearAllTimers();

    // Reset localStorage mock store for isolation
    mockLocalStorageStore = {
        // Pre-seed with core definitions to simulate a more realistic environment for constructor.
        // The constructor tries to load 'audioBlocks_definitions' and 'audioBlocks_instances'.
        // If these are not present, it initializes with defaults and then saves them.
        'audioBlocks_definitions': JSON.stringify(initialDefinitionsForTestLoad.map(def => ({...def, parameters: def.parameters.map(p => { const { currentValue, ...paramDef } = p as any; return paramDef;}) }))),
        'audioBlocks_instances': JSON.stringify([]),
    };

    onDefinitionsChangeCallback = jest.fn();
    onInstancesChangeCallback = jest.fn();
  });

  test('constructor should save instances and definitions immediately (internal methods)', () => {
    new (BlockStateManager as any)(onDefinitionsChangeCallback, onInstancesChangeCallback);

    // Check that setItem was called for both definitions and instances by constructor's internal direct saves.
    // The exact content of definitions might include AI generated flags etc., so expect.any(String) is safer.
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith('audioBlocks_definitions', expect.any(String));
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith('audioBlocks_instances', expect.any(String));

    // Two calls from constructor's internal direct saves.
    // Note: _loadDefinitions and _loadAndProcessInstances might also call setItem if they encounter errors and reset to defaults.
    // Given the pre-seeded localStorage, they should load successfully.
    // The constructor explicitly calls _saveDefinitionsToLocalStorageInternal and _saveInstancesToLocalStorageInternal.
    expect(mockLocalStorage.setItem).toHaveBeenCalledTimes(2);
  });

  test('_saveInstancesToLocalStorage should be debounced', () => {
    const bsm = new (BlockStateManager as any)(onDefinitionsChangeCallback, onInstancesChangeCallback);
    mockLocalStorage.setItem.mockClear(); // Clear calls from constructor

    bsm.addBlockInstance(AudioOutputBlock.getDefinition()); // Changed
    bsm.addBlockInstance(AudioOutputBlock.getDefinition()); // Changed

    expect(mockLocalStorage.setItem).not.toHaveBeenCalled();

    jest.advanceTimersByTime(DEBOUNCE_WAIT_MS);

    expect(mockLocalStorage.setItem).toHaveBeenCalledTimes(1);
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith('audioBlocks_instances', expect.any(String));
  });

  test('_saveDefinitionsToLocalStorage should be debounced', () => {
    const bsm = new (BlockStateManager as any)(onDefinitionsChangeCallback, onInstancesChangeCallback);
    mockLocalStorage.setItem.mockClear(); // Clear calls from constructor

    const newDef1: BlockDefinition = { id: 'test-def-1', name: 'Test Def 1', inputs: [], outputs: [], parameters: [], logicCode: '', runsAtAudioRate: false, isAiGenerated: true, initialPrompt: "Test prompt 1" };
    const newDef2: BlockDefinition = { id: 'test-def-2', name: 'Test Def 2', inputs: [], outputs: [], parameters: [], logicCode: '', runsAtAudioRate: false, isAiGenerated: true, initialPrompt: "Test prompt 2" };

    bsm.addBlockDefinition(newDef1);
    bsm.addBlockDefinition(newDef2);

    expect(mockLocalStorage.setItem).not.toHaveBeenCalled();

    jest.advanceTimersByTime(DEBOUNCE_WAIT_MS);

    expect(mockLocalStorage.setItem).toHaveBeenCalledTimes(1);
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith('audioBlocks_definitions', expect.any(String));
  });

  test('updateMultipleBlockInstances should call _onInstancesChangeCallback once and trigger debounced save', () => {
    const bsm = new (BlockStateManager as any)(onDefinitionsChangeCallback, onInstancesChangeCallback);
    const initialInstance = bsm.addBlockInstance(AudioOutputBlock.getDefinition()); // Changed
    mockLocalStorage.setItem.mockClear(); // Clear calls from constructor & addBlockInstance's initial save
    onInstancesChangeCallback.mockClear();

    const updates: InstanceUpdatePayload[] = [
      { instanceId: initialInstance.instanceId, updates: { name: 'New Name 1' } },
      { instanceId: initialInstance.instanceId, updates: (prev) => ({ ...prev, name: 'New Name 2' }) } // Example of function update
    ];

    bsm.updateMultipleBlockInstances(updates);

    expect(onInstancesChangeCallback).toHaveBeenCalledTimes(1);
    expect(mockLocalStorage.setItem).not.toHaveBeenCalled(); // Save is debounced

    jest.advanceTimersByTime(DEBOUNCE_WAIT_MS);

    expect(mockLocalStorage.setItem).toHaveBeenCalledTimes(1);
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith('audioBlocks_instances', expect.any(String));

    const instances = bsm.getBlockInstances();
    const updatedInstance = instances.find((inst: BlockInstance) => inst.instanceId === initialInstance.instanceId);
    expect(updatedInstance?.name).toBe('New Name 2');
  });
});
