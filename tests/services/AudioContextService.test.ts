import { AudioContextService, InitAudioResult } from '../../services/AudioContextService';
import { AudioContextState } from '../../types';

// Define a type for our extended AudioContext mock
interface MockAudioContext extends AudioContext {
  _triggerStateChange: (newState: AudioContextState) => void;
  _getGainNodeMock: () => any; // Helper to get the gain node mock associated with this context
}

describe('AudioContextService', () => {
    let onContextStateChangeCallback: jest.Mock;
    let audioContextService: AudioContextService;
    let mockAudioContextInstances: MockAudioContext[] = []; // To keep track of created mock contexts

    beforeEach(() => {
        jest.clearAllMocks();
        mockAudioContextInstances = []; // Reset instances
        onContextStateChangeCallback = jest.fn();

        global.AudioContext = jest.fn().mockImplementation(() => {
            const gainNodeMock = {
                connect: jest.fn(),
                disconnect: jest.fn(),
            };
            const contextMock = {
                suspend: jest.fn().mockResolvedValue(undefined),
                resume: jest.fn().mockResolvedValue(undefined),
                close: jest.fn().mockResolvedValue(undefined),
                createGain: jest.fn().mockReturnValue(gainNodeMock),
                destination: { type: 'AudioDestinationNode' } as AudioDestinationNode, // Simplified mock
                sampleRate: 44100,
                state: 'suspended' as AudioContextState,
                onstatechange: null as (() => void) | null,
                _triggerStateChange: function(newState: AudioContextState) {
                    this.state = newState;
                    if (this.onstatechange) {
                        this.onstatechange();
                    }
                },
                _getGainNodeMock: function() { return gainNodeMock; }
            };
            const mockInstance = contextMock as unknown as MockAudioContext;
            mockAudioContextInstances.push(mockInstance);
            return mockInstance;
        });

        audioContextService = new AudioContextService(onContextStateChangeCallback);
    });

    test('constructor initializes', () => {
        expect(audioContextService).toBeDefined();
        // console.log is called in constructor, can spy if needed:
        // const consoleSpy = jest.spyOn(console, 'log');
        // expect(consoleSpy).toHaveBeenCalledWith('[AudioContextService] Initialized');
    });

    describe('initialize', () => {
        test('should create, resume a new AudioContext if none exists, and connect gain node', async () => {
            const result: InitAudioResult = await audioContextService.initialize();

            expect(global.AudioContext).toHaveBeenCalledTimes(1);
            const createdContext = mockAudioContextInstances[0];
            expect(createdContext).toBeDefined();
            expect(createdContext.createGain).toHaveBeenCalledTimes(1);
            const gainNode = createdContext._getGainNodeMock();
            expect(gainNode.connect).toHaveBeenCalledWith(createdContext.destination);
            expect(createdContext.resume).toHaveBeenCalledTimes(1); // Initial state is 'suspended'
            expect(result.context).toBe(createdContext);
            expect(result.contextJustResumed).toBe(true); // Assuming resume makes it running

            // Simulate state change to running after resume
            createdContext._triggerStateChange('running');
            expect(onContextStateChangeCallback).toHaveBeenCalledWith('running');
        });

        test('should resume an existing suspended AudioContext', async () => {
            // Initialize once
            await audioContextService.initialize();
            const contextInstance = mockAudioContextInstances[0];
            contextInstance._triggerStateChange('suspended'); // Ensure it's suspended
            onContextStateChangeCallback.mockClear();
            (contextInstance.resume as jest.Mock).mockClear();


            const result = await audioContextService.initialize();

            expect(contextInstance.resume).toHaveBeenCalledTimes(1);
            expect(result.context).toBe(contextInstance);
            expect(result.contextJustResumed).toBe(true); // It attempted to resume
        });

        test('should not resume an existing running AudioContext', async () => {
            await audioContextService.initialize();
            const contextInstance = mockAudioContextInstances[0];
            contextInstance._triggerStateChange('running'); // Set to running
            onContextStateChangeCallback.mockClear();
            (contextInstance.resume as jest.Mock).mockClear();

            const result = await audioContextService.initialize();

            expect(contextInstance.resume).not.toHaveBeenCalled();
            expect(result.context).toBe(contextInstance);
            expect(result.contextJustResumed).toBe(false);
        });

        test('should create a new context if existing one is closed', async () => {
            // First initialization
            await audioContextService.initialize();
            const oldContextInstance = mockAudioContextInstances[0];
            oldContextInstance._triggerStateChange('closed'); // Simulate it being closed
            const oldGainNode = oldContextInstance._getGainNodeMock();

            (global.AudioContext as jest.Mock).mockClear(); // Clear calls to AudioContext constructor for next check
            (oldContextInstance.close as jest.Mock).mockClear();


            const result = await audioContextService.initialize();

            expect(oldContextInstance.close).toHaveBeenCalledTimes(1); // old one closed
            expect(oldGainNode.disconnect).toHaveBeenCalled(); // old gain node disconnected
            expect(global.AudioContext).toHaveBeenCalledTimes(1); // new one created

            const newContextInstance = mockAudioContextInstances[1]; // Second instance from the factory
            expect(result.context).toBe(newContextInstance);
            expect(newContextInstance.resume).toHaveBeenCalledTimes(1); // New one is suspended initially
            expect(result.contextJustResumed).toBe(true);
        });

        test('should handle error during AudioContext creation', async () => {
            (global.AudioContext as jest.Mock).mockImplementationOnce(() => {
                throw new Error('Test creation error');
            });
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            const result = await audioContextService.initialize();
            expect(result.context).toBeNull();
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Critical Error initializing new AudioContext: Test creation error'));
            consoleErrorSpy.mockRestore();
        });

        test('should handle error during existing context resume', async () => {
            await audioContextService.initialize();
            const contextInstance = mockAudioContextInstances[0];
            contextInstance._triggerStateChange('suspended');
            (contextInstance.resume as jest.Mock).mockRejectedValueOnce(new Error('Resume failed'));
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const result = await audioContextService.initialize();

            expect(result.context).toBe(contextInstance); // Context still exists
            expect(result.contextJustResumed).toBe(false);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error resuming existing context: Resume failed'));
            consoleErrorSpy.mockRestore();
        });

        test('should not resume if forceNoResume is true', async () => {
            await audioContextService.initialize(true); // forceNoResume = true
            const contextInstance = mockAudioContextInstances[0];
            expect(contextInstance.resume).not.toHaveBeenCalled();
            expect(audioContextService.getContextState()).toBe('suspended'); // Stays suspended
        });
    });

    describe('suspendContext', () => {
        test('should suspend a running context', async () => {
            await audioContextService.initialize();
            const contextInstance = mockAudioContextInstances[0];
            contextInstance._triggerStateChange('running');

            await audioContextService.suspendContext();
            expect(contextInstance.suspend).toHaveBeenCalledTimes(1);
        });

        test('should not suspend if context not running or not initialized', async () => {
            // Test when suspended
            await audioContextService.initialize(); // initial state is suspended
            const contextInstance = mockAudioContextInstances[0];
            await audioContextService.suspendContext();
            expect(contextInstance.suspend).not.toHaveBeenCalled();

            // Test when no context (service not initialized)
            const freshService = new AudioContextService(onContextStateChangeCallback);
            // Cannot get contextInstance easily here if initialize is not called
            // but the internal check `this.context && this.context.state === 'running'` covers it.
            // To be more explicit, we can check logs or lack of calls if possible.
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
            await freshService.suspendContext();
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("AudioContext not running or not initialized, cannot suspend."));
            consoleWarnSpy.mockRestore();
        });
    });

    describe('resumeContext', () => {
        test('should resume a suspended context', async () => {
            await audioContextService.initialize(); // initial state is suspended
            const contextInstance = mockAudioContextInstances[0];

            await audioContextService.resumeContext();
            expect(contextInstance.resume).toHaveBeenCalledTimes(1); // resume was called once during init, once now
        });

        test('should not resume if context not suspended or not initialized', async () => {
            await audioContextService.initialize();
            const contextInstance = mockAudioContextInstances[0];
            contextInstance._triggerStateChange('running'); // Set to running
            (contextInstance.resume as jest.Mock).mockClear(); // Clear calls from init

            await audioContextService.resumeContext();
            expect(contextInstance.resume).not.toHaveBeenCalled();

            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
            const freshService = new AudioContextService(onContextStateChangeCallback);
            await freshService.resumeContext();
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("AudioContext not suspended or not initialized, cannot resume."));
            consoleWarnSpy.mockRestore();
        });
    });

    describe('cleanupContext', () => {
        test('should close context, disconnect gain, and nullify references', async () => {
            await audioContextService.initialize();
            const contextInstance = mockAudioContextInstances[0];
            const gainNode = contextInstance._getGainNodeMock();
            contextInstance._triggerStateChange('running'); // So close can be called

            await audioContextService.cleanupContext();

            expect(contextInstance.close).toHaveBeenCalledTimes(1);
            expect(gainNode.disconnect).toHaveBeenCalledTimes(1);
            expect(audioContextService.getAudioContext()).toBeNull();
            expect(audioContextService.getMasterGainNode()).toBeNull();
        });

        test('should handle no context during cleanup', async () => {
            // No initialize call, so context is null
            // We expect no errors and graceful execution
            const consoleLogSpy = jest.spyOn(console, 'log');
            await audioContextService.cleanupContext();
            expect(consoleLogSpy).toHaveBeenCalledWith("[AudioContextService] Cleaning up AudioContext."); // Standard log
            // No context close should be called
        });
    });

    describe('getters', () => {
        test('getAudioContext should return the current context', async () => {
            expect(audioContextService.getAudioContext()).toBeNull(); // Initially null
            await audioContextService.initialize();
            expect(audioContextService.getAudioContext()).toBe(mockAudioContextInstances[0]);
        });

        test('getMasterGainNode should return the current master gain node', async () => {
            expect(audioContextService.getMasterGainNode()).toBeNull(); // Initially null
            await audioContextService.initialize();
            const contextInstance = mockAudioContextInstances[0];
            expect(audioContextService.getMasterGainNode()).toBe(contextInstance._getGainNodeMock());
        });

        test('getContextState should return the current context state', async () => {
            expect(audioContextService.getContextState()).toBeNull(); // Initially null
            await audioContextService.initialize();
            const contextInstance = mockAudioContextInstances[0];
            contextInstance._triggerStateChange('running');
            expect(audioContextService.getContextState()).toBe('running');
        });

        test('getSampleRate should return the sample rate from context', async () => {
            expect(audioContextService.getSampleRate()).toBeNull(); // Initially null
            await audioContextService.initialize();
            expect(audioContextService.getSampleRate()).toBe(44100);
        });
    });

    test('onstatechange handler set by service should trigger service callback', async () => {
        await audioContextService.initialize();
        const contextInstance = audioContextService.getAudioContext() as MockAudioContext | null;

        expect(contextInstance).not.toBeNull();
        expect(contextInstance!.onstatechange).toBeInstanceOf(Function);

        // Simulate the browser invoking onstatechange
        contextInstance!._triggerStateChange('closed');

        expect(onContextStateChangeCallback).toHaveBeenCalledWith('closed');
    });
});
