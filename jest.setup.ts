// jest.setup.ts
jest.doMock('@google/genai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContentStream: jest.fn().mockResolvedValue({
        stream: (async function* () {
          yield { text: () => "mocked stream part 1" };
          yield { text: () => "mocked stream part 2" };
        })(),
        response: Promise.resolve({ text: () => "mocked full response" })
      }),
      generateContent: jest.fn().mockResolvedValue({
        response: { text: () => "mocked response" }
      })
    })
  })),
  HarmCategory: { HARM_CATEGORY_UNSPECIFIED: "HARM_CATEGORY_UNSPECIFIED" },
  HarmBlockThreshold: { BLOCK_NONE: "BLOCK_NONE" }
}));

// Mock AudioContext and related browser APIs
global.AudioContext = jest.fn().mockImplementation(() => ({
  createGain: jest.fn(() => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    gain: { value: 0 }
  })),
  createOscillator: jest.fn(() => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    type: '',
    frequency: { setValueAtTime: jest.fn(), value: 440 }
  })),
  createBiquadFilter: jest.fn(() => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    type: '',
    frequency: { setValueAtTime: jest.fn(), value: 440 },
    Q: { setValueAtTime: jest.fn(), value: 1 },
    gain: { setValueAtTime: jest.fn(), value: 0 }
  })),
  createDelay: jest.fn(() => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    delayTime: { value: 0 }
  })),
  createAnalyser: jest.fn(() => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    fftSize: 2048,
    getByteTimeDomainData: jest.fn(),
    getByteFrequencyData: jest.fn()
  })),
  createScriptProcessor: jest.fn(() => ({ // For AudioWorkletNode fallback if needed
    connect: jest.fn(),
    disconnect: jest.fn(),
    onaudioprocess: null,
  })),
  createMediaStreamSource: jest.fn(stream => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    mediaStream: stream,
  })),
  createMediaElementSource: jest.fn(_element => ({ // Changed element to _element
    connect: jest.fn(),
    disconnect: jest.fn(),
  })),
  destination: {
    channelCount: 2,
    channelCountMode: "explicit",
    channelInterpretation: "speakers",
    maxChannelCount: 2,
    numberOfInputs: 1,
    numberOfOutputs: 0,
  },
  sampleRate: 44100,
  currentTime: 0,
  state: 'suspended', // Initial state
  resume: jest.fn().mockResolvedValue(undefined).mockImplementation(function(this: any) { // Typed this
    this.state = 'running';
    if (this.onstatechange) {
      this.onstatechange();
    }
    return Promise.resolve();
  }),
  suspend: jest.fn().mockResolvedValue(undefined).mockImplementation(function(this: any) { // Typed this
    this.state = 'suspended';
    if (this.onstatechange) {
      this.onstatechange();
    }
    return Promise.resolve();
  }),
  close: jest.fn().mockResolvedValue(undefined).mockImplementation(function(this: any) { // Typed this
    this.state = 'closed';
    if (this.onstatechange) {
      this.onstatechange();
    }
    return Promise.resolve();
  }),
  onstatechange: null,
  audioWorklet: {
    addModule: jest.fn().mockResolvedValue(undefined)
  }
}));

global.MediaStream = jest.fn().mockImplementation(() => ({
  getTracks: jest.fn(() => []),
  addTrack: jest.fn(),
  removeTrack: jest.fn(),
}));

// Ensure navigator exists
if (!(global as any).navigator) {
  (global as any).navigator = {};
}

// Define mediaDevices with a more robust approach
Object.defineProperty(global.navigator, 'mediaDevices', {
  value: {
    getUserMedia: jest.fn().mockResolvedValue(new MediaStream()),
    enumerateDevices: jest.fn().mockResolvedValue([]),
    // Include other mediaDevices properties/methods if they are accessed by the application
    // For example: addEventListener: jest.fn(), removeEventListener: jest.fn()
  },
  writable: true, // Allows tests to override parts of mediaDevices if necessary
  configurable: true,
});

// Clear mocks before each test to ensure test isolation
beforeEach(() => {
  jest.clearAllMocks();
  // Reset the state of AudioContext mock if needed, e.g., state
  // This might require a more complex mock setup if tests depend on specific sequences of states
});
