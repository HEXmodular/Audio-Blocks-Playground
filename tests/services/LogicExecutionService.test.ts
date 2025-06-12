import { LogicExecutionService } from '../@services/LogicExecutionService';
import { BlockInstance, BlockDefinition, Connection } from '../@types/types';
import { BlockStateManager, getDefaultOutputValue as actualGetDefaultOutputValue } from '../../state/BlockStateManager';
import { AudioEngine } from '../../hooks/useAudioEngine';
import { NATIVE_AD_ENVELOPE_BLOCK_DEFINITION } from '@constants/constants';


// Mock BlockStateManager and its helper getDefaultOutputValue
jest.mock('../../state/BlockStateManager', () => {
    const originalModule = jest.requireActual('../../state/BlockStateManager');
    return {
        ...originalModule,
        BlockStateManager: jest.fn().mockImplementation(() => ({
            updateBlockInstance: jest.fn(),
            updateMultipleBlockInstances: jest.fn(), // Added for batching tests
            addLogToBlockInstance: jest.fn(),
            getBlockInstanceById: jest.fn(),
            // Provide a mock for getDefinitionForBlock if it's part of BlockStateManager
            // and LES is expected to use BSM's version directly.
            // However, LES constructor takes a getDefinitionForBlock callback, so that's the primary one to mock.
        })),
        getDefaultOutputValue: jest.fn((type: string) => {
            // Use a simplified mock or the actual one for basic types
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
    let mockAudioEngine: jest.Mocked<AudioEngine>;
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

        mockBlockStateManager = new BlockStateManager() as jest.Mocked<BlockStateManager>;
        mockGetDefinitionForBlock = jest.fn();

        mockAudioEngine = {
            getSampleRate: jest.fn().mockReturnValue(48000),
            sendManagedAudioWorkletNodeMessage: jest.fn(),
            triggerNativeNodeEnvelope: jest.fn(),
            triggerNativeNodeAttackHold: jest.fn(),
            triggerNativeNodeRelease: jest.fn(),
            updateManagedNativeNodeParams: jest.fn(),
            isAudioGloballyEnabled: true, // Default
            // Mock other AudioEngine parts if they become used by LogicExecutionService
        } as any;

        service = new LogicExecutionService(
            mockBlockStateManager,
            mockGetDefinitionForBlock,
            mockAudioEngine
        );

        mockInstances = [];
        mockConnections = [];
        mockDefinitions = new Map();
        mockGetDefinitionForBlock.mockImplementation((instance: BlockInstance) => mockDefinitions.get(instance.definitionId));

        // Reset the mock for getDefaultOutputValue for clean state per test if needed
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
        const defA: BlockDefinition = { id: 'defA', name: 'A', inputs: [], outputs: [{id: 'outA', name: 'OutA', type: 'number'}], logicCode: logicA };
        const defB: BlockDefinition = { id: 'defB', name: 'B', inputs: [{id: 'inB', name: 'InB', type: 'number'}], outputs: [{id: 'outB', name: 'OutB', type: 'number'}], logicCode: logicB };
        mockDefinitions.set('defA', defA);
        mockDefinitions.set('defB', defB);

        const instA: BlockInstance = { instanceId: 'instA', definitionId: 'defA', name: 'A1', x:0,y:0,parameters:[], internalState: {}, lastRunOutputs: { outA: 0 } };
        const instB: BlockInstance = { instanceId: 'instB', definitionId: 'defB', name: 'B1', x:0,y:0,parameters:[], internalState: {}, lastRunOutputs: { outB: 0 } };
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
            // Ensure isAudioGloballyEnabled is true for the first call
            mockAudioEngine.isAudioGloballyEnabled = true;
            service.updateDependencies(mockInstances, mockConnections, 120, true, mockAudioEngine);
            // Loop should start if not running
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Logic processing loop STARTED"));

            // Ensure isAudioGloballyEnabled is false for the second call
            mockAudioEngine.isAudioGloballyEnabled = false;
            service.updateDependencies(mockInstances, mockConnections, 120, false, mockAudioEngine);
             // Loop should stop
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Logic processing loop STOPPED"));
            consoleLogSpy.mockRestore();
        });
    });

    describe('Execution Order and Loop Control', () => {
        test('runInstancesLoop should batch updates and call updateMultipleBlockInstances once', () => {
            setupGraph(); // Sets up instA -> instB, instA outputs 10

            // Prime instA's output for instB if not handled by setupGraph's lastRunOutputs
             service['currentTickOutputs'] = { 'instA': { 'outA': 10 } };


            // Directly call runInstancesLoop (it's private, so use type assertion)
            (service as any).runInstancesLoop();

            expect(mockBlockStateManager.updateMultipleBlockInstances).toHaveBeenCalledTimes(1);
            const batchedUpdates = mockBlockStateManager.updateMultipleBlockInstances.mock.calls[0][0];
            expect(batchedUpdates).toHaveLength(2);

            // Check update for instA
            const updateA = batchedUpdates.find((u: any) => u.instanceId === 'instA');
            expect(updateA).toBeDefined();
            expect(updateA.updates.lastRunOutputs.outA).toBe(10); // From 'setOutput("outA", 10);'

            // Check update for instB
            const updateB = batchedUpdates.find((u: any) => u.instanceId === 'instB');
            expect(updateB).toBeDefined();
            // instB logic: 'setOutput("outB", inputs.inB * 2);' where inputs.inB comes from instA's outA (10)
            expect(updateB.updates.lastRunOutputs.outB).toBe(20);

            // Verify order within the batch
            expect(batchedUpdates[0].instanceId).toBe('instA');
            expect(batchedUpdates[1].instanceId).toBe('instB');
        });

        test('startProcessingLoop starts interval if enabled and not running', () => {
            service.updateDependencies([], [], 120, true, mockAudioEngine); // Enabled
            service.startProcessingLoop();
            expect(setIntervalSpy).toHaveBeenCalledTimes(1);
            expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 10);
        });

        test('startProcessingLoop does not start if already running', () => {
            service.updateDependencies([], [], 120, true, mockAudioEngine);
            service.startProcessingLoop(); // First start
            service.startProcessingLoop(); // Second start
            expect(setIntervalSpy).toHaveBeenCalledTimes(1); // Should only be called once
        });

        test('startProcessingLoop does not start if audio is not globally enabled', () => {
            service.updateDependencies([], [], 120, false, mockAudioEngine); // Disabled
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

    // Tests refactored to verify outcome via updateMultipleBlockInstances
    describe('Logic Execution via runInstancesLoop (replaces handleRunInstance tests)', () => {
        test('executes simple logic, updates outputs and internal state via batch', () => {
            const logicCode = 'setOutput("val", params.p1 + inputs.in1); return { newCount: (internalState.count || 0) + 1 };';
            const def: BlockDefinition = { id: 'd1', name: 'D1', inputs: [{id: 'in1', name:'In1', type:'number'}], outputs: [{id:'val', name:'Val', type:'number'}], logicCode, category:'math', runsAtAudioRate: false };
            const inst: BlockInstance = { instanceId: 'i1', definitionId: 'd1', name:'I1', position:{x:0,y:0}, parameters: [{id:'p1', name:'P1', currentValue:10, type:'number'} as BlockParameter], internalState: {count: 5}, lastRunOutputs:{}, logs:[]};
            mockDefinitions.set('d1', def);
            mockInstances.push(inst);
            (actualGetDefaultOutputValue as jest.Mock).mockReturnValue(3); // For inputs.in1

            service.updateDependencies(mockInstances, [], 120, true, mockAudioEngine);
            (service as any).runInstancesLoop();

            expect(mockBlockStateManager.updateMultipleBlockInstances).toHaveBeenCalledTimes(1);
            const batchedUpdates = mockBlockStateManager.updateMultipleBlockInstances.mock.calls[0][0];
            expect(batchedUpdates).toHaveLength(1);
            const updatePayload = batchedUpdates[0];
            expect(updatePayload.instanceId).toBe('i1');
            expect(updatePayload.updates.lastRunOutputs.val).toBe(13); // 10 (param) + 3 (input)
            expect(updatePayload.updates.internalState.newCount).toBe(6);
        });

        test('logs error and updates block if definition not found via batch', () => {
            const inst: BlockInstance = { instanceId: 'ghost', definitionId: 'noDef', name:'G', position:{x:0,y:0}, parameters:[], internalState:{}, lastRunOutputs:{}, logs:[]};
            mockInstances.push(inst);
            getDefinitionForBlockMock.mockReturnValue(undefined); // Ensure getDefinitionForBlock (used by LES) returns undefined

            service.updateDependencies(mockInstances, [], 120, true, mockAudioEngine);
            (service as any).runInstancesLoop();

            expect(mockBlockStateManager.addLogToBlockInstance).toHaveBeenCalledWith('ghost', "Error: Definition noDef not found.");
            expect(mockBlockStateManager.updateMultipleBlockInstances).toHaveBeenCalledTimes(1);
            const batchedUpdates = mockBlockStateManager.updateMultipleBlockInstances.mock.calls[0][0];
            expect(batchedUpdates).toHaveLength(1);
            const updatePayload = batchedUpdates[0];
            expect(updatePayload.instanceId).toBe('ghost');
            expect(updatePayload.updates.error).toBe("Definition noDef not found.");
        });

        test('handles runtime error in block logic via batch', () => {
            const def: BlockDefinition = { id: 'dErr', name: 'DErr', inputs:[], outputs:[], logicCode: 'throw new Error("Logic boom!");', category:'test', runsAtAudioRate:false };
            const inst: BlockInstance = { instanceId: 'iErr', definitionId: 'dErr', name:'IErr', position:{x:0,y:0},parameters:[], internalState:{}, lastRunOutputs:{}, logs:[]};
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
            expect(updatePayload.updates.error).toBe("Runtime error in 'IErr': Logic boom!");
            expect(updatePayload.updates.lastRunOutputs).toEqual({});
        });

        test('custom logger in logic code calls addLogToBlockInstance (still direct)', () => {
            const logicCode = '__custom_block_logger__("Hello from logic"); return {};';
            const def: BlockDefinition = { id: 'dLog', name: 'DLog', inputs: [], outputs: [], logicCode, category:'test', runsAtAudioRate:false };
            const inst: BlockInstance = { instanceId: 'iLog', definitionId: 'dLog', name:'ILog', position:{x:0,y:0},parameters:[], internalState:{}, lastRunOutputs:{}, logs:[]};
            mockDefinitions.set('dLog', def);
            mockInstances.push(inst);

            service.updateDependencies(mockInstances, [], 120, true, mockAudioEngine);
            (service as any).runInstancesLoop();

            expect(mockBlockStateManager.addLogToBlockInstance).toHaveBeenCalledWith('iLog', "Hello from logic");
        });

        test('postMessageToWorklet in logic calls audioEngine method', () => {
            const logicCode = 'postMessageToWorklet({ type: "testMsg" }); return {};';
            const def: BlockDefinition = { id: 'dWkt', name: 'DWkt', inputs: [], outputs: [], logicCode, category:'test', runsAtAudioRate:false };
            const inst: BlockInstance = { instanceId: 'iWkt', definitionId: 'dWkt', name:'IWkt', position:{x:0,y:0},parameters:[], internalState:{}, lastRunOutputs:{}, logs:[]};
            mockDefinitions.set('dWkt', def);
            mockInstances.push(inst);

            service.updateDependencies(mockInstances, [], 120, true, mockAudioEngine);
            (service as any).runInstancesLoop();

            expect(mockAudioEngine.sendManagedAudioWorkletNodeMessage).toHaveBeenCalledWith('iWkt', {type: "testMsg"});
        });

        test('handles NATIVE_AD_ENVELOPE_BLOCK_DEFINITION trigger via batch', () => {
            const def = NATIVE_AD_ENVELOPE_BLOCK_DEFINITION; // Assuming this is a valid BlockDefinition
            const inst: BlockInstance = {
                instanceId: 'envAd', definitionId: def.id, name:'EnvAD', position:{x:0,y:0},
                parameters: [
                    {id: 'attackTime', name:'Attack', currentValue: 0.1, type:'number'},
                    {id: 'decayTime', name:'Decay', currentValue: 0.5, type:'number'},
                    {id: 'peakLevel', name:'Peak', currentValue: 0.8, type:'number'},
                ] as BlockParameter[],
                internalState: {}, // Logic will set envelopeNeedsTriggering
                lastRunOutputs: {}, logs:[]
            };
            mockDefinitions.set(def.id, def);
            mockInstances.push(inst);

            // Simulate logic that sets envelopeNeedsTriggering to true
            const originalCompileLogicFunction = (service as any).compileLogicFunction;
            (service as any).compileLogicFunction = (instanceId: string, logicCode: string) => {
                return jest.fn().mockReturnValue({ envelopeNeedsTriggering: true }); // Mocked logic function's return for this test
            };

            service.updateDependencies(mockInstances, [], 120, true, mockAudioEngine);
            (service as any).runInstancesLoop();

            expect(mockAudioEngine.triggerNativeNodeEnvelope).toHaveBeenCalledWith('envAd', 0.1, 0.5, 0.8);
            expect(mockBlockStateManager.updateMultipleBlockInstances).toHaveBeenCalledTimes(1);
            const batchedUpdates = mockBlockStateManager.updateMultipleBlockInstances.mock.calls[0][0];
            const updatePayload = batchedUpdates.find((u:any) => u.instanceId === 'envAd');
            expect(updatePayload.updates.internalState.envelopeNeedsTriggering).toBe(false); // Should be reset

            (service as any).compileLogicFunction = originalCompileLogicFunction; // Restore
        });
    });

    describe('Cache Management', () => {
        test('clearLogicFunctionCache clears the cache', () => {
            setupGraph(); // Populates cache by running instances
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
            expect((service as any).logicFunctionCache.has('instB')).toBe(true); // instB should still be there
        });

        test('recompiles function if not in cache (after clearing) when processing loop runs', () => {
            const logicCode = 'setOutput("val", 1); return {};';
            const def: BlockDefinition = { id: 'cacheDef', name: 'Cache', inputs: [], outputs: [{id: 'val', name: 'Val', type: 'number'}], logicCode, category:'test', runsAtAudioRate: false };
            const inst: BlockInstance = { instanceId: 'cacheInst', definitionId: 'cacheDef', name:'CacheInst', position:{x:0,y:0},parameters:[], internalState:{}, lastRunOutputs:{}, logs:[]};
            mockDefinitions.set('cacheDef', def);
            mockInstances.push(inst);

            service.updateDependencies(mockInstances, [], 120, true, mockAudioEngine);

            const compileSpy = jest.spyOn(service as any, 'compileLogicFunction');

            (service as any).runInstancesLoop(); // First run, compiles
            expect(compileSpy).toHaveBeenCalledWith('cacheInst', logicCode);
            expect(compileSpy).toHaveBeenCalledTimes(1);

            service.clearBlockFromCache('cacheInst');
            compileSpy.mockClear(); // Clear spy calls but not implementation

            (service as any).runInstancesLoop(); // Second run, should recompile
            expect(compileSpy).toHaveBeenCalledWith('cacheInst', logicCode);
            expect(compileSpy).toHaveBeenCalledTimes(1);

            compileSpy.mockRestore();
        });
    });
});
