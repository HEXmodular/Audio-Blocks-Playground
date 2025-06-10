import { LogicExecutionService } from '../../services/LogicExecutionService';
import { BlockInstance, BlockDefinition, Connection } from '../../types';
import { BlockStateManager, getDefaultOutputValue as actualGetDefaultOutputValue } from '../../state/BlockStateManager';
import { AudioEngine } from '../../hooks/useAudioEngine';
import { NATIVE_AD_ENVELOPE_BLOCK_DEFINITION } from '../../constants';


// Mock BlockStateManager and its helper getDefaultOutputValue
jest.mock('../../state/BlockStateManager', () => {
    const originalModule = jest.requireActual('../../state/BlockStateManager');
    return {
        ...originalModule, // Preserve other exports if any
        BlockStateManager: jest.fn().mockImplementation(() => ({
            updateBlockInstance: jest.fn(),
            addLogToBlockInstance: jest.fn(),
            getBlockInstanceById: jest.fn(), // Added if service internal API uses it
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

    let mockInstances: BlockInstance[];
    let mockConnections: Connection[];
    let mockDefinitions: Map<string, BlockDefinition>;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();

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
            // appLog is removed from constructor
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
            service.updateDependencies(mockInstances, mockConnections, 120, true, mockAudioEngine);
            // Loop should start if not running
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Logic processing loop STARTED"));

            service.updateDependencies(mockInstances, mockConnections, 120, false, mockAudioEngine);
             // Loop should stop
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("Logic processing loop STOPPED"));
            consoleLogSpy.mockRestore();
        });
    });

    describe('Execution Order and Loop Control', () => {
        test('runInstancesLoop executes instances in topological order', () => {
            setupGraph();
            // Directly call runInstancesLoop (it's private, so use type assertion)
            (service as any).runInstancesLoop();

            // Check updateBlockInstance was called for A then B
            expect(mockBlockStateManager.updateBlockInstance.mock.calls[0][0]).toBe('instA');
            expect(mockBlockStateManager.updateBlockInstance.mock.calls[1][0]).toBe('instB');

            // Check that instA's output (10) was used as input for instB, resulting in 20
            const updateFnB = mockBlockStateManager.updateBlockInstance.mock.calls[1][1];
            const finalStateB = updateFnB(mockInstances[1]); // mockInstances[1] is instB
            expect(finalStateB.lastRunOutputs.outB).toBe(20);
        });

        test('startProcessingLoop starts interval if enabled and not running', () => {
            service.updateDependencies([], [], 120, true, mockAudioEngine); // Enabled
            service.startProcessingLoop();
            expect(setInterval).toHaveBeenCalledTimes(1);
            expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 10);
        });

        test('startProcessingLoop does not start if already running', () => {
            service.updateDependencies([], [], 120, true, mockAudioEngine);
            service.startProcessingLoop(); // First start
            service.startProcessingLoop(); // Second start
            expect(setInterval).toHaveBeenCalledTimes(1); // Should only be called once
        });

        test('startProcessingLoop does not start if audio is not globally enabled', () => {
            service.updateDependencies([], [], 120, false, mockAudioEngine); // Disabled
            service.startProcessingLoop();
            expect(setInterval).not.toHaveBeenCalled();
        });

        test('stopProcessingLoop clears interval if running', () => {
            service.updateDependencies([], [], 120, true, mockAudioEngine);
            service.startProcessingLoop();
            service.stopProcessingLoop();
            expect(clearInterval).toHaveBeenCalledTimes(1);
        });

        test('stopProcessingLoop does nothing if not running', () => {
            service.stopProcessingLoop();
            expect(clearInterval).not.toHaveBeenCalled();
        });
    });

    describe('handleRunInstance - Logic Execution', () => {
        test('executes simple logic, updates outputs and internal state', () => {
            const logicCode = 'setOutput("val", params.p1 + inputs.in1); return { newCount: (internalState.count || 0) + 1 };';
            const def: BlockDefinition = { id: 'd1', name: 'D1', inputs: [{id: 'in1', name:'In1', type:'number'}], outputs: [{id:'val', name:'Val', type:'number'}], logicCode };
            const inst: BlockInstance = { instanceId: 'i1', definitionId: 'd1', name:'I1', x:0,y:0, parameters: [{id:'p1', name:'P1', currentValue:10, type:'number'}], internalState: {count: 5}, lastRunOutputs:{}};
            mockDefinitions.set('d1', def);
            (actualGetDefaultOutputValue as jest.Mock).mockReturnValueOnce(3); // For inputs.in1

            (service as any).handleRunInstance(inst, {sampleRate: 48000, bpm: 120});

            expect(mockBlockStateManager.updateBlockInstance).toHaveBeenCalledWith('i1', expect.any(Function));
            const updateFn = mockBlockStateManager.updateBlockInstance.mock.calls[0][1];
            const newState = updateFn(inst);
            expect(newState.lastRunOutputs.val).toBe(13); // 10 (param) + 3 (input)
            expect(newState.internalState.newCount).toBe(6);
        });

        test('logs error and updates block if definition not found', () => {
            const inst: BlockInstance = { instanceId: 'ghost', definitionId: 'noDef', name:'G', x:0,y:0,parameters:[], internalState:{}};
            mockGetDefinitionForBlock.mockReturnValue(undefined);
            (service as any).handleRunInstance(inst, {sampleRate: 48000, bpm: 120});
            expect(mockBlockStateManager.addLogToBlockInstance).toHaveBeenCalledWith('ghost', "Error: Definition noDef not found.");
            expect(mockBlockStateManager.updateBlockInstance).toHaveBeenCalledWith('ghost', { error: "Definition noDef not found." });
        });

        test('handles runtime error in block logic', () => {
            const def: BlockDefinition = { id: 'dErr', name: 'DErr', inputs:[], outputs:[], logicCode: 'throw new Error("Logic boom!");' };
            const inst: BlockInstance = { instanceId: 'iErr', definitionId: 'dErr', name:'IErr', x:0,y:0,parameters:[], internalState:{}};
            mockDefinitions.set('dErr', def);
            (service as any).handleRunInstance(inst, {sampleRate: 48000, bpm: 120});
            expect(mockBlockStateManager.addLogToBlockInstance).toHaveBeenCalledWith('iErr', "Runtime error in 'IErr': Logic boom!");
            expect(mockBlockStateManager.updateBlockInstance).toHaveBeenCalledWith('iErr', {error: "Runtime error in 'IErr': Logic boom!", lastRunOutputs: {}});
        });

        test('custom logger in logic code calls addLogToBlockInstance', () => {
            const logicCode = '__custom_block_logger__("Hello from logic"); return {};';
            const def: BlockDefinition = { id: 'dLog', name: 'DLog', inputs: [], outputs: [], logicCode };
            const inst: BlockInstance = { instanceId: 'iLog', definitionId: 'dLog', name:'ILog', x:0,y:0,parameters:[], internalState:{}};
            mockDefinitions.set('dLog', def);
            (service as any).handleRunInstance(inst, {sampleRate: 48000, bpm: 120});
            expect(mockBlockStateManager.addLogToBlockInstance).toHaveBeenCalledWith('iLog', "Hello from logic");
        });

        test('postMessageToWorklet in logic calls audioEngine method', () => {
            const logicCode = 'postMessageToWorklet({ type: "testMsg" }); return {};';
            const def: BlockDefinition = { id: 'dWkt', name: 'DWkt', inputs: [], outputs: [], logicCode };
            const inst: BlockInstance = { instanceId: 'iWkt', definitionId: 'dWkt', name:'IWkt', x:0,y:0,parameters:[], internalState:{}};
            mockDefinitions.set('dWkt', def);
            (service as any).handleRunInstance(inst, {sampleRate: 48000, bpm: 120});
            expect(mockAudioEngine.sendManagedAudioWorkletNodeMessage).toHaveBeenCalledWith('iWkt', {type: "testMsg"});
        });

        test('handles NATIVE_AD_ENVELOPE_BLOCK_DEFINITION trigger', () => {
            const def = NATIVE_AD_ENVELOPE_BLOCK_DEFINITION;
            const inst: BlockInstance = {
                instanceId: 'envAd', definitionId: def.id, name:'EnvAD', x:0,y:0,
                parameters: [
                    {id: 'attackTime', currentValue: 0.1, type:'number'},
                    {id: 'decayTime', currentValue: 0.5, type:'number'},
                    {id: 'peakLevel', currentValue: 0.8, type:'number'},
                ],
                internalState: { envelopeNeedsTriggering: true }, // Logic should set this
                lastRunOutputs: {}
            };
            mockDefinitions.set(def.id, def);
            // Simulate logic that sets envelopeNeedsTriggering to true
            const originalCompileFunc = (service as any).compileLogicFunction;
            (service as any).compileLogicFunction = jest.fn().mockReturnValue(
                () => ({ envelopeNeedsTriggering: true }) // Mocked logic function's return
            );

            (service as any).handleRunInstance(inst, {sampleRate: 48000, bpm: 120});

            expect(mockAudioEngine.triggerNativeNodeEnvelope).toHaveBeenCalledWith('envAd', 0.1, 0.5, 0.8);
            const updateFn = mockBlockStateManager.updateBlockInstance.mock.calls[0][1];
            const newState = updateFn(inst);
            expect(newState.internalState.envelopeNeedsTriggering).toBe(false); // Should be reset

            (service as any).compileLogicFunction = originalCompileFunc; // Restore
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

        test('recompiles function if not in cache (after clearing)', () => {
            const logicCode = 'setOutput("val", 1); return {};';
            const def: BlockDefinition = { id: 'cacheDef', name: 'Cache', inputs: [], outputs: [{id: 'val', name: 'Val', type: 'number'}], logicCode };
            const inst: BlockInstance = { instanceId: 'cacheInst', definitionId: 'cacheDef', name:'CacheInst', x:0,y:0,parameters:[], internalState:{}};
            mockDefinitions.set('cacheDef', def);

            const compileSpy = jest.spyOn(service as any, 'compileLogicFunction');

            (service as any).handleRunInstance(inst, {sampleRate:48000, bpm:120}); // First run, compiles
            expect(compileSpy).toHaveBeenCalledTimes(1);

            service.clearBlockFromCache('cacheInst');

            (service as any).handleRunInstance(inst, {sampleRate:48000, bpm:120}); // Second run, should recompile
            expect(compileSpy).toHaveBeenCalledTimes(2);

            compileSpy.mockRestore();
        });
    });
});
