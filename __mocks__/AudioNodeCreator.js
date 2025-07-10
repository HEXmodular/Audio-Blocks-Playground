// Empty mock for AudioNodeCreator
const mockAudioNodeCreatorInstance = {
  setAudioContext: jest.fn(),
  createNode: jest.fn(),
  removeNode: jest.fn(),
  getNode: jest.fn(),
  getAllNodes: jest.fn(() => []),
  updateNodeParameters: jest.fn(),
  connectNodes: jest.fn(),
  disconnectNodes: jest.fn(),
  removeAllManagedNativeNodes: jest.fn(),
  getAnalyserNodeForInstance: jest.fn(),
};

export const AudioNodeCreator = {
  getInstance: jest.fn(() => mockAudioNodeCreatorInstance),
  // Add any static methods if they are used and need mocking
};

// Add the missing export that BlockStateManager is trying to use
export const ALL_NATIVE_BLOCK_DEFINITIONS = [];

export default AudioNodeCreator;
