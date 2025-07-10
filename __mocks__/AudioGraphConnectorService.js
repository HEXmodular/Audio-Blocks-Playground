// Empty mock for AudioGraphConnectorService
export const AudioGraphConnectorService = jest.fn().mockImplementation(() => ({
  updateConnections: jest.fn(),
  disconnectAll: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
}));
export default AudioGraphConnectorService;
