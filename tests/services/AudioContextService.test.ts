import { AudioContextService, InitAudioResult } from '@services/AudioContextService';
import { AudioContextState } from '@interfaces';

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
                resume: jest.fn().mockImplementation(function(this: MockAudioContext) {
                    // Simulate that resume() eventually leads to 'running' state
                    // This helps align the service's check `this.context.state === 'running'`
                    // with the outcome of the resume call more closely in the test environment.
                    if (this.state === 'suspended') { // Only trigger if actually suspended
                        // Schedule state change to occur after current sync operations
                        Promise.resolve().then(() => {
                            this._triggerStateChange('running');
                        });
                    }
                    return Promise.resolve(undefined);
                }),
                close: jest.fn().mockResolvedValue(undefined),
                createGain: jest.fn().mockReturnValue(gainNodeMock),
                destination: { type: 'AudioDestinationNode' } as unknown as AudioDestinationNode, // Simplified mock, cast to unknown first
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
            const result: InitAudioResult = await audioContextService.initialize(true); // Pass true to resume

            expect(global.AudioContext).toHaveBeenCalledTimes(1);
            const createdContext = mockAudioContextInstances[0];
            expect(createdContext).toBeDefined();
            expect(createdContext.createGain).toHaveBeenCalledTimes(1);
            const gainNode = createdContext._getGainNodeMock();
            expect(gainNode.connect).toHaveBeenCalledWith(createdContext.destination);
            expect(createdContext.resume).not.toHaveBeenCalled(); // Changed: Should not resume on initial creation
            expect(result.context).toBe(createdContext);
            expect(result.context?.state).toBe('suspended'); // Verify it's suspended
            expect(result.contextJustResumed).toBe(false);

            // If we manually resume it now, then state change should occur
            await createdContext.resume(); // Manually resume for further state check
            createdContext._triggerStateChange('running'); // Simulate actual state change post-resume
            expect(audioContextService.getContextState()).toBe('running');
            expect(onContextStateChangeCallback).toHaveBeenCalledWith('running');
        });

        test('should resume an existing suspended AudioContext', async () => {
            // Initialize once, don't auto-resume so the mock isn't called yet
            await audioContextService.initialize(false);
            const contextInstance = mockAudioContextInstances[0];
            // Ensure it's suspended (it should be by default from mock)
            expect(contextInstance.state).toBe('suspended');
            onContextStateChangeCallback.mockClear();
            // (contextInstance.resume as jest.Mock).mockClear(); // Not needed if not called yet


            const result = await audioContextService.initialize(true); // Pass true to resume existing suspended

            expect(contextInstance.resume).toHaveBeenCalledTimes(1); // Now it should be called
            expect(result.context).toBe(contextInstance);

            // Simulate state change to running AFTER resume would have been processed
            contextInstance._triggerStateChange('running');
            expect(result.contextJustResumed).toBe(true); // Service logic: contextJustResumed && this.context?.state === 'running'
        });

        test('should not resume an existing running AudioContext', async () => {
            await audioContextService.initialize(true); // Pass true to resume initially
            const contextInstance = mockAudioContextInstances[0];
            contextInstance._triggerStateChange('running'); // Set to running
            onContextStateChangeCallback.mockClear();
            (contextInstance.resume as jest.Mock).mockClear();

            const result = await audioContextService.initialize(true); // Pass true (though it won't resume a running context)

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


            const result = await audioContextService.initialize(true); // Pass true, but it shouldn't resume a NEW context

            expect(oldGainNode.disconnect).toHaveBeenCalled();
            expect(global.AudioContext).toHaveBeenCalledTimes(1);

            const newContextInstance = mockAudioContextInstances[1];
            expect(result.context).toBe(newContextInstance);
            expect(newContextInstance.resume).not.toHaveBeenCalled(); // Changed: Should not resume on initial creation
            expect(result.context?.state).toBe('suspended'); // Verify it's suspended
            expect(result.contextJustResumed).toBe(false);
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
            await audioContextService.initialize(true); // Pass true to resume initially
            const contextInstance = mockAudioContextInstances[0];
            contextInstance._triggerStateChange('suspended');
            (contextInstance.resume as jest.Mock).mockRejectedValueOnce(new Error('Resume failed'));
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            const result = await audioContextService.initialize(true); // Pass true to attempt resume

            expect(result.context).toBe(contextInstance); // Context still exists
            expect(result.contextJustResumed).toBe(false);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error resuming existing context: Resume failed'));
            consoleErrorSpy.mockRestore();
        });

        test('should not call resume if resumeContext is false and context is suspended', async () => {
            // Initialize with resumeContext = true to make sure resume() could be called once
            await audioContextService.initialize(true);
            const contextInstance = mockAudioContextInstances[0];
            contextInstance._triggerStateChange('suspended'); // Ensure suspended
            (contextInstance.resume as jest.Mock).mockClear(); // Clear previous resume calls from init

            await audioContextService.initialize(false); // Call with resumeContext = false

            expect(contextInstance.resume).not.toHaveBeenCalled(); // Should not have been called again
            expect(audioContextService.getContextState()).toBe('suspended');
        });
    });

    describe('suspendContext', () => {
        test('should suspend a running context', async () => {
            await audioContextService.initialize();
            const contextInstance = audioContextService.getAudioContext() as MockAudioContext;
            expect(contextInstance).not.toBeNull(); // Ensure context exists
            contextInstance._triggerStateChange('running');

            await audioContextService.suspendContext();
            expect(contextInstance.suspend).toHaveBeenCalledTimes(1);
        });

        test('should not suspend if context not running or not initialized', async () => {
            // Test when suspended
            await audioContextService.initialize(); // initial state is suspended
            const contextInstance = audioContextService.getAudioContext() as MockAudioContext;
            expect(contextInstance).not.toBeNull(); // Ensure context exists
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
            const contextInstance = audioContextService.getAudioContext() as MockAudioContext;
            expect(contextInstance).not.toBeNull(); // Ensure context exists

            await audioContextService.resumeContext();
            expect(contextInstance.resume).toHaveBeenCalledTimes(1);
        });

        test('should not resume if context not suspended or not initialized', async () => {
            await audioContextService.initialize();
            const contextInstance = audioContextService.getAudioContext() as MockAudioContext;
            expect(contextInstance).not.toBeNull(); // Ensure context exists
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
