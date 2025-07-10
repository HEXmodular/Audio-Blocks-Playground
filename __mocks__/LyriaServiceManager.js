// Empty mock for LyriaServiceManager
export const LyriaServiceManager = jest.fn().mockImplementation(() => ({
  _setAudioContextAndMasterGain: jest.fn(),
  createLyriaService: jest.fn(),
  removeLyriaService: jest.fn(),
  getLyriaService: jest.fn(),
  updateLyriaService: jest.fn(),
  removeAllManagedLyriaServices: jest.fn(),
  getManagedInstancesMap: jest.fn(() => new Map()),
}));
export default LyriaServiceManager;
