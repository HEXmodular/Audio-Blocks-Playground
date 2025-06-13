import { LogicExecutionService } from '@services/LogicExecutionService';
import { BlockInstance, BlockDefinition, Connection, BlockParameter } from '@interfaces/common';
import { BlockStateManager, getDefaultOutputValue as actualGetDefaultOutputValue } from '@state/BlockStateManager';
import { AudioEngineService } from '@services/AudioEngineService';
// import { NATIVE_AD_ENVELOPE_BLOCK_DEFINITION } from '@constants/constants'; // Removed
import { EnvelopeNativeBlock } from '../../services/native-blocks/EnvelopeNativeBlock'; // Added


// Mock BlockStateManager
jest.mock('@state/BlockStateManager', () => {
    const originalModule = jest.requireActual('@state/BlockStateManager');
    return {
        ...originalModule,
        BlockStateManager: jest.fn().mockImplementation(() => ({
            updateBlockInstance: jest.fn(),
            updateMultipleBlockInstances: jest.fn(),
            addLogToBlockInstance: jest.fn(),
            getBlockInstanceById: jest.fn(),
        })),
        getDefaultOutputValue: jest.fn((type: string) => {
            if (type === 'audio' || type === 'cv') return null;
            if (type === 'number') return 0;
            if (type === 'boolean') return false;
            if (type === 'gate') return false;
            return null;
        }),
    };
});

describe('LogicExecutionService', () => {
    let mockBlockStateManager: jest.Mocked<BlockStateManager>;
    let mockGetDefinitionForBlock: jest.Mock;
    let mockAudioEngine: jest.Mocked<AudioEngineService>;
    let service: LogicExecutionService;
    let setIntervalSpy: jest.SpyInstance;
    let clearIntervalSpy: jest.SpyInstance;

    let mockInstances: BlockInstance[];
    let mockConnections: Connection[];
    let mockDefinitions: Map<string, BlockDefinition>;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
        setIntervalSpy = jest.spyOn(global, 'setInterval');
        clearIntervalSpy = jest.spyOn(global, 'clearInterval');

        mockBlockStateManager = new BlockStateManager(jest.fn(), jest.fn()) as jest.Mocked<BlockStateManager>;
        mockGetDefinitionForBlock = jest.fn();

        mockAudioEngine = {
            // Public Managers
            audioWorkletManager: {
                isAudioWorkletSystemReady: false,
                sendManagedAudioWorkletNodeMessage: jest.fn(),
            } as any,
            nativeNodeManager: {
                triggerNativeNodeEnvelope: jest.fn(),
                triggerNativeNodeAttackHold: jest.fn(),
                triggerNativeNodeRelease: jest.fn(),
                updateManagedNativeNodeParams: jest.fn(),
            } as any,
            lyriaServiceManager: {} as any,

            // Public Getters (mocked as properties)
            audioContext: null,
            masterGainNode: null,
            isAudioGloballyEnabled: true, // Default state for tests
            audioInitializationError: null,
            availableOutputDevices: [],
            selectedSinkId: null,
            audioEngineState: {
                isAudioGloballyEnabled: true,
                audioInitializationError: null,
                availableOutputDevices: [],
                selectedSinkId: null,
                audioContextState: null,
                sampleRate: 48000,
            } as any,

            // Public Methods
            getSampleRate: jest.fn().mockReturnValue(48000),
            sendManagedAudioWorkletNodeMessage: jest.fn(),
            initializeBasicAudioContext: jest.fn(),
            toggleGlobalAudio: jest.fn(),
            getAudioContextState: jest.fn(),
            setOutputDevice: jest.fn(),
            listOutputDevices: jest.fn(),
            removeAllManagedNodes: jest.fn(),
            updateAudioGraphConnections: jest.fn(),
            addManagedAudioWorkletNode: jest.fn(),
            removeManagedAudioWorkletNode: jest.fn(),
            getManagedAudioWorkletNodeInfo: jest.fn(),
            getAllManagedAudioWorkletNodeInfo: jest.fn(),
            addNativeNode: jest.fn(),
            removeNativeNode: jest.fn(),
            getNativeNodeInfo: jest.fn(),
            getAllNativeNodeInfo: jest.fn(),
            triggerNativeNodeEnvelope: jest.fn(),
            dispose: jest.fn(),
            subscribe: jest.fn(),
            unsubscribe: jest.fn(),
            getAudioContextServiceInstance: jest.fn(),

            // Adding back private-like properties for structural compatibility with jest.Mocked<AudioEngineService>
            // These should match the structure expected by the TS2352 error if it reappears.
            _audioContext: null,
            _masterGainNode: null,
            _isAudioGloballyEnabled: true, // Underlying field for the getter
            _audioInitializationError: null,
            _availableOutputDevices: [],
            _selectedSinkId: null,
            _audioContextState: null,
            _subscribers: [],
            _audioContextService: {} as any,
            _outputWorkletConnections: new Map(),
            _notifySubscribers: jest.fn(),
            // audioGraphConnectorService is private, so we might not need to mock it explicitly
            // unless LogicExecutionService tries to access it (which it shouldn't)
            // For structural matching by jest.Mocked, if it's listed in error, add as {} as any
            // audioGraphConnectorService: {} as any,
        } as any as jest.Mocked<AudioEngineService>; // Cast to any first, then to Mocked type

        service = new LogicExecutionService(
            mockBlockStateManager,
            mockGetDefinitionForBlock,
            mockAudioEngine
        );

        mockInstances = [];
        mockConnections = [];
        mockDefinitions = new Map();
        mockGetDefinitionForBlock.mockImplementation((instance: BlockInstance) => mockDefinitions.get(instance.definitionId));

        (actualGetDefaultOutputValue as jest.Mock).mockImplementation((type: string) => {
            if (type === 'audio' || type === 'cv') return null;
            if (type === 'number') return 0;
            if (type === 'boolean') return false;
            if (type === 'gate') return false;
            return null;
        });
    });

    afterEach(() => {
        jest.useRealTimers();
        setIntervalSpy.mockRestore();
        clearIntervalSpy.mockRestore();
    });

    const setupGraph = (logicA: string = 'setOutput("outA", 10); return {};', logicB: string = 'setOutput("outB", inputs.inB * 2); return {};') => {
        const defA: BlockDefinition = { id: 'defA', name: 'A', inputs: [], outputs: [{id: 'outA', name: 'OutA', type: 'number'}], parameters: [], logicCode: logicA, initialPrompt: "" };
        const defB: BlockDefinition = { id: 'defB', name: 'B', inputs: [{id: 'inB', name: 'InB', type: 'number'}], outputs: [{id: 'outB', name: 'OutB', type: 'number'}], parameters: [], logicCode: logicB, initialPrompt: "" };
        mockDefinitions.set('defA', defA);
        mockDefinitions.set('defB', defB);

        const instA: BlockInstance = { instanceId: 'instA', definitionId: 'defA', name: 'A1', position: {x:0,y:0}, parameters:[], internalState: {}, lastRunOutputs: { outA: 0 }, logs: [], modificationPrompts: [] };
        const instB: BlockInstance = { instanceId: 'instB', definitionId: 'defB', name: 'B1', position: {x:0,y:0}, parameters:[], internalState: {}, lastRunOutputs: { outB: 0 }, logs: [], modificationPrompts: [] };
        mockInstances.push(instA, instB);

        const connAB: Connection = { id: 'connAB', fromInstanceId: 'instA', fromOutputId: 'outA', toInstanceId: 'instB', toInputId: 'inB' };
        mockConnections.push(connAB);

        service.updateDependencies(mockInstances, mockConnections, 120, mockAudioEngine.isAudioGloballyEnabled, mockAudioEngine);
    };

    describe('Constructor and Dependencies', () => {
        test('constructor initializes', () => {
            expect(service).toBeDefined();
        });
        test('updateDependencies updates internal state and starts/stops loop', () => {
            const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
            (mockAudioEngine as any)._isAudioGloballyEnabled = true; // Set the underlying field for the mock
            service.updateDependencies(mockInstances, mockConnections, 120, true, mockAudioEngine);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Logic processing loop STARTED"));

            (mockAudioEngine as any)._isAudioGloballyEnabled = false; // Set the underlying field for the mock
            service.updateDependencies(mockInstances, mockConnections, 120, false, mockAudioEngine);
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Logic processing loop STOPPED"));
            consoleLogSpy.mockRestore();
        });
    });

    describe('Execution Order and Loop Control', () => {
        test('runInstancesLoop should batch updates and call updateMultipleBlockInstances once', () => {
            setupGraph();
            service['currentTickOutputs'] = { 'instA': { 'outA': 10 } };
            (service as any).runInstancesLoop();

            expect(mockBlockStateManager.updateMultipleBlockInstances).toHaveBeenCalledTimes(1);
            const batchedUpdates = mockBlockStateManager.updateMultipleBlockInstances.mock.calls[0][0];
            expect(batchedUpdates).toHaveLength(2);

            const updateA = batchedUpdates.find((u: any) => u.instanceId === 'instA');
            expect(updateA).toBeDefined();
            if (updateA && typeof updateA.updates !== 'function') {
                expect(updateA.updates!.lastRunOutputs!.outA).toBe(10);
            }

            const updateB = batchedUpdates.find((u: any) => u.instanceId === 'instB');
            expect(updateB).toBeDefined();
            if (updateB && typeof updateB.updates !== 'function') {
                expect(updateB.updates!.lastRunOutputs!.outB).toBe(20);
            }
            expect(batchedUpdates[0].instanceId).toBe('instA');
            expect(batchedUpdates[1].instanceId).toBe('instB');
        });

        test('startProcessingLoop starts interval if enabled and not running', () => {
            service.updateDependencies([], [], 120, true, mockAudioEngine);
            service.startProcessingLoop();
            expect(setIntervalSpy).toHaveBeenCalledTimes(1);
            expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 10);
        });

        test('startProcessingLoop does not start if already running', () => {
            service.updateDependencies([], [], 120, true, mockAudioEngine);
            service.startProcessingLoop();
            service.startProcessingLoop();
            expect(setIntervalSpy).toHaveBeenCalledTimes(1);
        });

        test('startProcessingLoop does not start if audio is not globally enabled', () => {
            service.updateDependencies([], [], 120, false, mockAudioEngine);
            service.startProcessingLoop();
            expect(setIntervalSpy).not.toHaveBeenCalled();
        });

        test('stopProcessingLoop clears interval if running', () => {
            service.updateDependencies([], [], 120, true, mockAudioEngine);
            service.startProcessingLoop();
            service.stopProcessingLoop();
            expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
        });

        test('stopProcessingLoop does nothing if not running', () => {
            service.stopProcessingLoop();
            expect(clearIntervalSpy).not.toHaveBeenCalled();
        });
    });

    describe('Logic Execution via runInstancesLoop (replaces handleRunInstance tests)', () => {
        test('executes simple logic, updates outputs and internal state via batch', () => {
            const logicCode = 'setOutput("val", params.p1 + inputs.in1); return { newCount: (internalState.count || 0) + 1 };';
            const def: BlockDefinition = { id: 'd1', name: 'D1', inputs: [{id: 'in1', name:'In1', type:'number'}], outputs: [{id:'val', name:'Val', type:'number'}], parameters: [], logicCode, initialPrompt: "", runsAtAudioRate: false };
            const inst: BlockInstance = { instanceId: 'i1', definitionId: 'd1', name:'I1', position:{x:0,y:0}, parameters: [{id:'p1', name:'P1', currentValue:10, type:'number_input', defaultValue: 0} as BlockParameter], internalState: {count: 5}, lastRunOutputs:{}, logs:[], modificationPrompts: []};
            mockDefinitions.set('d1', def);
            mockInstances.push(inst);
            (actualGetDefaultOutputValue as jest.Mock).mockReturnValue(3);

            service.updateDependencies(mockInstances, [], 120, true, mockAudioEngine);
            (service as any).runInstancesLoop();

            expect(mockBlockStateManager.updateMultipleBlockInstances).toHaveBeenCalledTimes(1);
            const batchedUpdates = mockBlockStateManager.updateMultipleBlockInstances.mock.calls[0][0];
            expect(batchedUpdates).toHaveLength(1);
            const updatePayload = batchedUpdates[0];
            expect(updatePayload.instanceId).toBe('i1');
            if (typeof updatePayload.updates !== 'function') {
                expect(updatePayload.updates!.lastRunOutputs!.val).toBe(13);
                expect(updatePayload.updates!.internalState!.newCount).toBe(6);
            }
        });

        test('logs error and updates block if definition not found via batch', () => {
            const inst: BlockInstance = { instanceId: 'ghost', definitionId: 'noDef', name:'G', position:{x:0,y:0}, parameters:[], internalState:{}, lastRunOutputs:{}, logs:[], modificationPrompts: []};
            mockInstances.push(inst);
            mockGetDefinitionForBlock.mockReturnValue(undefined);

            service.updateDependencies(mockInstances, [], 120, true, mockAudioEngine);
            (service as any).runInstancesLoop();

            expect(mockBlockStateManager.addLogToBlockInstance).toHaveBeenCalledWith('ghost', "Error: Definition noDef not found.");
            expect(mockBlockStateManager.updateMultipleBlockInstances).toHaveBeenCalledTimes(1);
            const batchedUpdates = mockBlockStateManager.updateMultipleBlockInstances.mock.calls[0][0];
            expect(batchedUpdates).toHaveLength(1);
            const updatePayload = batchedUpdates[0];
            expect(updatePayload.instanceId).toBe('ghost');
            if (typeof updatePayload.updates !== 'function') {
                expect(updatePayload.updates!.error).toBe("Definition noDef not found.");
            }
        });

        test('handles runtime error in block logic via batch', () => {
            const def: BlockDefinition = { id: 'dErr', name: 'DErr', inputs:[], outputs:[], parameters: [], logicCode: 'throw new Error("Logic boom!");', initialPrompt: "", runsAtAudioRate:false };
            const inst: BlockInstance = { instanceId: 'iErr', definitionId: 'dErr', name:'IErr', position:{x:0,y:0},parameters:[], internalState:{}, lastRunOutputs:{}, logs:[], modificationPrompts: []};
            mockDefinitions.set('dErr', def);
            mockInstances.push(inst);

            service.updateDependencies(mockInstances, [], 120, true, mockAudioEngine);
            (service as any).runInstancesLoop();

            expect(mockBlockStateManager.addLogToBlockInstance).toHaveBeenCalledWith('iErr', "Runtime error in 'IErr': Logic boom!");
            expect(mockBlockStateManager.updateMultipleBlockInstances).toHaveBeenCalledTimes(1);
            const batchedUpdates = mockBlockStateManager.updateMultipleBlockInstances.mock.calls[0][0];
            expect(batchedUpdates).toHaveLength(1);
            const updatePayload = batchedUpdates[0];
            expect(updatePayload.instanceId).toBe('iErr');
            if (typeof updatePayload.updates !== 'function') {
                expect(updatePayload.updates!.error).toBe("Runtime error in 'IErr': Logic boom!");
                expect(updatePayload.updates!.lastRunOutputs).toEqual({});
            }
        });

        test('custom logger in logic code calls addLogToBlockInstance (still direct)', () => {
            const logicCode = '__custom_block_logger__("Hello from logic"); return {};';
            const def: BlockDefinition = { id: 'dLog', name: 'DLog', inputs: [], outputs: [], parameters: [], logicCode, initialPrompt: "", runsAtAudioRate:false };
            const inst: BlockInstance = { instanceId: 'iLog', definitionId: 'dLog', name:'ILog', position:{x:0,y:0},parameters:[], internalState:{}, lastRunOutputs:{}, logs:[], modificationPrompts: []};
            mockDefinitions.set('dLog', def);
            mockInstances.push(inst);

            service.updateDependencies(mockInstances, [], 120, true, mockAudioEngine);
            (service as any).runInstancesLoop();

            expect(mockBlockStateManager.addLogToBlockInstance).toHaveBeenCalledWith('iLog', "Hello from logic");
        });

        test('postMessageToWorklet in logic calls audioEngine method', () => {
            const logicCode = 'postMessageToWorklet({ type: "testMsg" }); return {};';
            const def: BlockDefinition = { id: 'dWkt', name: 'DWkt', inputs: [], outputs: [], parameters: [], logicCode, initialPrompt: "", runsAtAudioRate:false };
            const inst: BlockInstance = { instanceId: 'iWkt', definitionId: 'dWkt', name:'IWkt', position:{x:0,y:0},parameters:[], internalState:{}, lastRunOutputs:{}, logs:[], modificationPrompts: []};
            mockDefinitions.set('dWkt', def);
            mockInstances.push(inst);

            service.updateDependencies(mockInstances, [], 120, true, mockAudioEngine);
            (service as any).runInstancesLoop();

            expect(mockAudioEngine.sendManagedAudioWorkletNodeMessage).toHaveBeenCalledWith('iWkt', {type: "testMsg"});
        });

        test('handles NATIVE_AD_ENVELOPE_BLOCK_DEFINITION trigger via batch', () => {
            const def = EnvelopeNativeBlock.getADEnvelopeDefinition();
            const inst: BlockInstance = {
                instanceId: 'envAd', definitionId: def.id, name:'EnvAD', position:{x:0,y:0},
                parameters: [
                    {id: 'attackTime', name:'Attack', currentValue: 0.1, type:'number_input', defaultValue: 0} as BlockParameter,
                    {id: 'decayTime', name:'Decay', currentValue: 0.5, type:'number_input', defaultValue: 0} as BlockParameter,
                    {id: 'peakLevel', name:'Peak', currentValue: 0.8, type:'number_input', defaultValue: 0} as BlockParameter,
                ],
                internalState: {},
                lastRunOutputs: {}, logs:[], modificationPrompts: []
            };
            mockDefinitions.set(def.id, def);
            mockInstances.push(inst);

            const originalCompileLogicFunction = (service as any).compileLogicFunction;
            (service as any).compileLogicFunction = (_instanceId: string, _logicCode: string) => { // NOSONAR
                return jest.fn().mockReturnValue({ envelopeNeedsTriggering: true });
            };

            service.updateDependencies(mockInstances, [], 120, true, mockAudioEngine);
            (service as any).runInstancesLoop();

            expect(mockAudioEngine.nativeNodeManager.triggerNativeNodeEnvelope).toHaveBeenCalledWith('envAd', 0.1, 0.5, 0.8);
            expect(mockBlockStateManager.updateMultipleBlockInstances).toHaveBeenCalledTimes(1);
            const batchedUpdates = mockBlockStateManager.updateMultipleBlockInstances.mock.calls[0][0];
            const updatePayload = batchedUpdates.find((u:any) => u.instanceId === 'envAd');
            if (updatePayload && typeof updatePayload.updates !== 'function') {
                expect(updatePayload.updates!.internalState!.envelopeNeedsTriggering).toBe(false);
            }

            (service as any).compileLogicFunction = originalCompileLogicFunction;
        });
    });

    describe('Cache Management', () => {
        test('clearLogicFunctionCache clears the cache', () => {
            setupGraph();
            (service as any).runInstancesLoop();
            const initialCacheSize = (service as any).logicFunctionCache.size;
            expect(initialCacheSize).toBeGreaterThan(0);

            service.clearLogicFunctionCache();
            expect((service as any).logicFunctionCache.size).toBe(0);
        });

        test('clearBlockFromCache removes specific entry', () => {
            setupGraph();
            (service as any).runInstancesLoop();
            expect((service as any).logicFunctionCache.has('instA')).toBe(true);

            service.clearBlockFromCache('instA');
            expect((service as any).logicFunctionCache.has('instA')).toBe(false);
            expect((service as any).logicFunctionCache.has('instB')).toBe(true);
        });

        test('recompiles function if not in cache (after clearing) when processing loop runs', () => {
            const logicCode = 'setOutput("val", 1); return {};';
            const def: BlockDefinition = { id: 'cacheDef', name: 'Cache', inputs: [], outputs: [{id: 'val', name: 'Val', type: 'number'}], parameters: [], logicCode, initialPrompt: "", runsAtAudioRate: false };
            const inst: BlockInstance = { instanceId: 'cacheInst', definitionId: 'cacheDef', name:'CacheInst', position:{x:0,y:0},parameters:[], internalState:{}, lastRunOutputs:{}, logs:[], modificationPrompts: []};
            mockDefinitions.set('cacheDef', def);
            mockInstances.push(inst);

            service.updateDependencies(mockInstances, [], 120, true, mockAudioEngine);

            const compileSpy = jest.spyOn(service as any, 'compileLogicFunction');

            (service as any).runInstancesLoop();
            expect(compileSpy).toHaveBeenCalledWith('cacheInst', logicCode);
            expect(compileSpy).toHaveBeenCalledTimes(1);

            service.clearBlockFromCache('cacheInst');
            compileSpy.mockClear();

            (service as any).runInstancesLoop();
            expect(compileSpy).toHaveBeenCalledWith('cacheInst', logicCode);
            expect(compileSpy).toHaveBeenCalledTimes(1);

            compileSpy.mockRestore();
        });
    });
});
