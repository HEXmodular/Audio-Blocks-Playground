// Empty mock for AudioContextService
export const AudioContextService = jest.fn().mockImplementation(() => ({
  initialize: jest.fn().mockResolvedValue({ context: {} }),
  getAudioContext: jest.fn(() => null),
  setSinkId: jest.fn().mockResolvedValue(undefined),
  getAvailableOutputDevices: jest.fn().mockResolvedValue([]),
  canChangeOutputDevice: jest.fn(() => true),
  suspendContext: jest.fn().mockResolvedValue(undefined),
  resumeContext: jest.fn().mockResolvedValue(undefined),
  closeContext: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  off: jest.fn(),
  notifyAudioStateChanged: jest.fn(),
}));
export default AudioContextService;
