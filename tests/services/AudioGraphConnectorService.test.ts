import { AudioGraphConnectorService, ActiveWebAudioConnection } from '@services/AudioGraphConnectorService';
import { Connection, BlockInstance, BlockDefinition } from '@interfaces/common';
import { ManagedWorkletNodeInfo } from '@hooks/useAudioWorkletManager';
import { ManagedNativeNodeInfo } from '@hooks/useNativeNodeManager';
import { ManagedLyriaServiceInfo } from '@hooks/hooks/useLyriaServiceManager';
import { NATIVE_ALLPASS_FILTER_BLOCK_DEFINITION, NATIVE_AUDIO_OUTPUT_BLOCK_DEFINITION } from '@constants/constants';

// Helper to create mock AudioNode
const createMockAudioNode = (name: string = 'node') => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    parameters: new Map<string, AudioParam>(),
    gain: { value: 0, setValueAtTime: jest.fn(), linearRampToValueAtTime: jest.fn() } as unknown as AudioParam,
    frequency: { value: 440, setValueAtTime: jest.fn(), linearRampToValueAtTime: jest.fn() } as unknown as AudioParam,
    delayTime: { value: 0, setValueAtTime: jest.fn(), linearRampToValueAtTime: jest.fn() } as unknown as AudioParam,
    _name: name,
});

// Helper to create mock AudioParam
const createMockAudioParam = (name: string = 'param') => ({
    value: 0,
    setValueAtTime: jest.fn(),
    linearRampToValueAtTime: jest.fn(),
    _name: name,
} as unknown as AudioParam);

describe('AudioGraphConnectorService', () => {
    let service: AudioGraphConnectorService;
    let mockAudioContext: any;
    let mockManagedWorkletNodes: Map<string, ManagedWorkletNodeInfo>;
    let mockManagedNativeNodes: Map<string, ManagedNativeNodeInfo>;
    let mockManagedLyriaServices: Map<string, ManagedLyriaServiceInfo>;
    let blockInstances: BlockInstance[];
    let connections: Connection[];
    let getDefinitionForBlock: jest.Mock;

    beforeEach(() => {
        service = new AudioGraphConnectorService();
        mockAudioContext = { state: 'running' };
        mockManagedWorkletNodes = new Map();
        mockManagedNativeNodes = new Map();
        mockManagedLyriaServices = new Map();
        blockInstances = [];
        connections = [];
        getDefinitionForBlock = jest.fn();
        jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        (console.error as jest.Mock).mockRestore();
        (console.warn as jest.Mock).mockRestore();
    });

    // Helper to set up basic blocks for testing
    const setupBasicBlocks = (params: {
        sourceType?: 'worklet' | 'native' | 'lyria',
        targetType?: 'worklet' | 'native',
        targetIsParam?: boolean,
        sourceDefOutputs?: BlockDefinition['outputs'],
        targetDefInputs?: BlockDefinition['inputs'],
    } = {}) => {
        const {
            sourceType = 'worklet',
            targetType = 'worklet',
            targetIsParam = false,
            sourceDefOutputs = [{id: 'out', name: 'Out', type: 'audio'}],
            targetDefInputs = targetIsParam
                ? [{id: 'inParam', name: 'InParam', type: 'audio', audioParamTarget: 'gain'}]
                : [{id: 'in', name: 'In', type: 'audio'}]
        } = params;

        const sourceAudioNode = createMockAudioNode('sourceNode');
        const targetAudioNode = createMockAudioNode('targetNode'); // This is the node that owns the param if targetIsParam
        const targetAudioParam = createMockAudioParam('targetGainParam');
        if (targetIsParam) {
            targetAudioNode.parameters.set('gain', targetAudioParam);
        }

        const sourceDef: BlockDefinition = { id: 'sourceDef', name: 'Source', inputs: [], outputs: sourceDefOutputs, logicCode: '', audioWorkletProcessorName: sourceType === 'worklet' ? 'source-proc' : undefined };
        const targetDef: BlockDefinition = { id: 'targetDef', name: 'Target', inputs: targetDefInputs, outputs: [], logicCode: '', audioWorkletProcessorName: targetType === 'worklet' ? 'target-proc' : undefined };

        const sourceInstance: BlockInstance = { instanceId: 'source1', definitionId: 'sourceDef', name: 'Source 1', x:0,y:0, parameters: [], internalState: {} };
        const targetInstance: BlockInstance = { instanceId: 'target1', definitionId: 'targetDef', name: 'Target 1', x:100,y:0, parameters: [], internalState: {} };

        blockInstances.push(sourceInstance, targetInstance);

        getDefinitionForBlock.mockImplementation((instance: BlockInstance) => {
            if (instance.definitionId === 'sourceDef') return sourceDef;
            if (instance.definitionId === 'targetDef') return targetDef;
            return undefined;
        });

        if (sourceType === 'worklet') {
            mockManagedWorkletNodes.set('source1', { node: sourceAudioNode as any, inputGainNode: null as any });
        } else if (sourceType === 'native') {
            mockManagedNativeNodes.set('source1', { node: null as any, nodeForInputConnections: null as any, nodeForOutputConnections: sourceAudioNode as any, paramTargetsForCv: new Map(), allpassInternalNodes: null });
        } else { // lyria
            mockManagedLyriaServices.set('source1', { outputNode: sourceAudioNode as any, service: null as any });
        }

        if (targetType === 'worklet') {
            mockManagedWorkletNodes.set('target1', { node: targetAudioNode as any, inputGainNode: null as any });
        } else { // native
            mockManagedNativeNodes.set('target1', { node: targetAudioNode as any, nodeForInputConnections: targetAudioNode as any, nodeForOutputConnections: null as any, paramTargetsForCv: targetIsParam ? new Map([['gain', targetAudioParam]]) : new Map(), allpassInternalNodes: null });
        }

        return { sourceAudioNode, targetAudioNode, targetAudioParam, sourceInstance, targetInstance };
    };


    describe('updateConnections guard conditions', () => {
        test('should disconnect all and clear if audioContext is null', () => {
            const mockConn = { connectionId: 'c1', sourceNode: createMockAudioNode(), targetNode: createMockAudioNode() } as ActiveWebAudioConnection;
            (service as any).activeWebAudioConnections.set('c1', mockConn);
            service.updateConnections(null, true, [], [], jest.fn(), new Map(), new Map(), new Map());
            expect(mockConn.sourceNode.disconnect).toHaveBeenCalledWith(mockConn.targetNode);
            expect((service as any).activeWebAudioConnections.size).toBe(0);
        });

        test('should disconnect all and clear if isAudioGloballyEnabled is false', () => {
            const mockConn = { connectionId: 'c1', sourceNode: createMockAudioNode(), targetNode: createMockAudioNode() } as ActiveWebAudioConnection;
            (service as any).activeWebAudioConnections.set('c1', mockConn);
            service.updateConnections(mockAudioContext, false, [], [], jest.fn(), new Map(), new Map(), new Map());
            expect(mockConn.sourceNode.disconnect).toHaveBeenCalledWith(mockConn.targetNode);
            expect((service as any).activeWebAudioConnections.size).toBe(0);
        });

        test('should disconnect all and clear if audioContext.state is not running', () => {
            const mockConn = { connectionId: 'c1', sourceNode: createMockAudioNode(), targetNode: createMockAudioNode() } as ActiveWebAudioConnection;
            (service as any).activeWebAudioConnections.set('c1', mockConn);
            mockAudioContext.state = 'suspended';
            service.updateConnections(mockAudioContext, true, [], [], jest.fn(), new Map(), new Map(), new Map());
            expect(mockConn.sourceNode.disconnect).toHaveBeenCalledWith(mockConn.targetNode);
            expect((service as any).activeWebAudioConnections.size).toBe(0);
        });
    });

    describe('Connection Logic', () => {
        test('should connect worklet audio node to worklet audio node', () => {
            const { sourceAudioNode, targetAudioNode, sourceInstance, targetInstance } = setupBasicBlocks();
            connections.push({ id: 'c1', fromInstanceId: 'source1', fromOutputId: 'out', toInstanceId: 'target1', toInputId: 'in' });
            service.updateConnections(mockAudioContext, true, connections, blockInstances, getDefinitionForBlock, mockManagedWorkletNodes, mockManagedNativeNodes, mockManagedLyriaServices);
            expect(sourceAudioNode.connect).toHaveBeenCalledWith(targetAudioNode);
            expect((service as any).activeWebAudioConnections.has('c1')).toBe(true);
        });

        test('should connect native audio node to worklet audio node', () => {
            const { sourceAudioNode, targetAudioNode, sourceInstance, targetInstance } = setupBasicBlocks({ sourceType: 'native' });
            connections.push({ id: 'c1', fromInstanceId: 'source1', fromOutputId: 'out', toInstanceId: 'target1', toInputId: 'in' });
            service.updateConnections(mockAudioContext, true, connections, blockInstances, getDefinitionForBlock, mockManagedWorkletNodes, mockManagedNativeNodes, mockManagedLyriaServices);
            expect(sourceAudioNode.connect).toHaveBeenCalledWith(targetAudioNode);
        });

        test('should connect worklet audio node to native audio param', () => {
            const { sourceAudioNode, targetAudioNode, targetAudioParam, sourceInstance, targetInstance } = setupBasicBlocks({ targetType: 'native', targetIsParam: true });
            connections.push({ id: 'c2', fromInstanceId: 'source1', fromOutputId: 'out', toInstanceId: 'target1', toInputId: 'inParam' });
            service.updateConnections(mockAudioContext, true, connections, blockInstances, getDefinitionForBlock, mockManagedWorkletNodes, mockManagedNativeNodes, mockManagedLyriaServices);
            expect(sourceAudioNode.connect).toHaveBeenCalledWith(targetAudioParam);
            expect((service as any).activeWebAudioConnections.has('c2')).toBe(true);
        });

        test('should disconnect old connections not in new set', () => {
            const { sourceAudioNode, targetAudioNode } = setupBasicBlocks();
            const oldConnInfo = { connectionId: 'old_c', sourceNode: sourceAudioNode, targetNode: targetAudioNode, targetParam: undefined };
            (service as any).activeWebAudioConnections.set('old_c', oldConnInfo);
            service.updateConnections(mockAudioContext, true, [], blockInstances, getDefinitionForBlock, mockManagedWorkletNodes, mockManagedNativeNodes, mockManagedLyriaServices);
            expect(sourceAudioNode.disconnect).toHaveBeenCalledWith(targetAudioNode);
            expect((service as any).activeWebAudioConnections.size).toBe(0);
        });

        test('should not connect if port types are not audio', () => {
            const { sourceAudioNode, sourceInstance, targetInstance } = setupBasicBlocks({ sourceDefOutputs: [{id: 'out', name: 'Out', type: 'number'}]});
            connections.push({ id: 'c_num', fromInstanceId: 'source1', fromOutputId: 'out', toInstanceId: 'target1', toInputId: 'in' });
            service.updateConnections(mockAudioContext, true, connections, blockInstances, getDefinitionForBlock, mockManagedWorkletNodes, mockManagedNativeNodes, mockManagedLyriaServices);
            expect(sourceAudioNode.connect).not.toHaveBeenCalled();
            expect((service as any).activeWebAudioConnections.size).toBe(0);
        });

        test('should log error if sourceNode.connect throws', () => {
            const { sourceAudioNode, targetAudioNode, sourceInstance, targetInstance } = setupBasicBlocks();
            sourceAudioNode.connect.mockImplementation(() => { throw new Error("Connection failed"); });
            connections.push({ id: 'c_err', fromInstanceId: 'source1', fromOutputId: 'out', toInstanceId: 'target1', toInputId: 'in' });

            service.updateConnections(mockAudioContext, true, connections, blockInstances, getDefinitionForBlock, mockManagedWorkletNodes, mockManagedNativeNodes, mockManagedLyriaServices);

            expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Error (Node) for ID c_err: Connection failed"));
            expect((service as any).activeWebAudioConnections.has('c_err')).toBe(false); // Should not be added if connect fails
        });

        test('should handle NATIVE_ALLPASS_FILTER_BLOCK_DEFINITION internal connections', () => {
            const sourceAudioNode = createMockAudioNode('sourceForAllpass');
            const allpassInternalInputGain1 = createMockAudioNode('allpassInputGain1');
            const allpassInternalPassthrough = createMockAudioNode('allpassPassthrough');

            const sourceDef: BlockDefinition = { id: 'sourceDef', name: 'Source', inputs: [], outputs: [{id: 'out', name: 'Out', type: 'audio'}], logicCode: '' };
            const allpassDef: BlockDefinition = NATIVE_ALLPASS_FILTER_BLOCK_DEFINITION; // Use actual definition

            const sourceInstance: BlockInstance = { instanceId: 'sourceAllpass', definitionId: 'sourceDef', name: 'SA', x:0,y:0,parameters:[], internalState:{} };
            const allpassInstance: BlockInstance = { instanceId: 'allpass1', definitionId: allpassDef.id, name: 'AP1', x:0,y:0,parameters:[], internalState:{} };

            blockInstances.push(sourceInstance, allpassInstance);
            getDefinitionForBlock.mockImplementation(inst => inst.definitionId === 'sourceDef' ? sourceDef : (inst.definitionId === allpassDef.id ? allpassDef : undefined));

            mockManagedWorkletNodes.set(sourceInstance.instanceId, { node: sourceAudioNode as any, inputGainNode: null as any });
            mockManagedNativeNodes.set(allpassInstance.instanceId, {
                node: createMockAudioNode('allpassMain') as any, // Main node
                nodeForInputConnections: null as any, // Not used in this path
                nodeForOutputConnections: createMockAudioNode('allpassOutput') as any,
                paramTargetsForCv: new Map(),
                allpassInternalNodes: {
                    inputGain1: allpassInternalInputGain1 as any,
                    inputPassthroughNode: allpassInternalPassthrough as any,
                    feedbackGain: createMockAudioNode('allpassFeedback') as any,
                    inputDelay: createMockAudioNode('allpassDelay') as any,
                }
            });

            connections.push({ id: 'c_allpass', fromInstanceId: sourceInstance.instanceId, fromOutputId: 'out', toInstanceId: allpassInstance.instanceId, toInputId: 'audio_in' });
            service.updateConnections(mockAudioContext, true, connections, blockInstances, getDefinitionForBlock, mockManagedWorkletNodes, mockManagedNativeNodes, mockManagedLyriaServices);

            expect(sourceAudioNode.connect).toHaveBeenCalledWith(allpassInternalInputGain1);
            expect(sourceAudioNode.connect).toHaveBeenCalledWith(allpassInternalPassthrough);
            expect((service as any).activeWebAudioConnections.has('c_allpass-path1')).toBe(true);
            expect((service as any).activeWebAudioConnections.has('c_allpass-path2')).toBe(true);
        });
    });

    describe('disconnectAll', () => {
        test('should disconnect all active connections (node and param)', () => {
            const { sourceAudioNode, targetAudioNode, targetAudioParam } = setupBasicBlocks(); // Doesn't matter which blocks, just need nodes/params
            const conn1Info: ActiveWebAudioConnection = { connectionId: 'c1', sourceNode: sourceAudioNode as any, targetNode: targetAudioNode as any };
            const conn2Info: ActiveWebAudioConnection = { connectionId: 'c2', sourceNode: sourceAudioNode as any, targetNode: targetAudioNode as any, targetParam: targetAudioParam };

            (service as any).activeWebAudioConnections.set('c1', conn1Info);
            (service as any).activeWebAudioConnections.set('c2', conn2Info);

            service.disconnectAll();

            expect(sourceAudioNode.disconnect).toHaveBeenCalledWith(targetAudioNode); // For conn1
            expect(sourceAudioNode.disconnect).toHaveBeenCalledWith(targetAudioParam); // For conn2
            expect((service as any).activeWebAudioConnections.size).toBe(0);
        });

        test('should do nothing if no active connections', () => {
            service.disconnectAll();
            expect((service as any).activeWebAudioConnections.size).toBe(0);
            // No mocks should have been called if there were no connections
        });

        test('should continue disconnecting if one disconnect throws error', () => {
            const node1 = createMockAudioNode('n1');
            const node2 = createMockAudioNode('n2');
            const node3 = createMockAudioNode('n3');
            const node4 = createMockAudioNode('n4');

            const conn1: ActiveWebAudioConnection = { connectionId: 'c1', sourceNode: node1 as any, targetNode: node2 as any };
            const conn2Error: ActiveWebAudioConnection = { connectionId: 'c2err', sourceNode: node2 as any, targetNode: node3 as any };
            const conn3: ActiveWebAudioConnection = { connectionId: 'c3', sourceNode: node3 as any, targetNode: node4 as any };

            (service as any).activeWebAudioConnections.set('c1', conn1);
            (service as any).activeWebAudioConnections.set('c2err', conn2Error);
            (service as any).activeWebAudioConnections.set('c3', conn3);

            node2.disconnect.mockImplementation(() => { throw new Error("Disconnect failed"); });

            service.disconnectAll();

            expect(node1.disconnect).toHaveBeenCalledWith(node2);
            expect(node2.disconnect).toHaveBeenCalledWith(node3); // Attempted
            expect(node3.disconnect).toHaveBeenCalledWith(node4); // Should still be called
            expect((service as any).activeWebAudioConnections.size).toBe(0); // Map should be cleared
            // expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("Error during disconnectAll for connection c2err: Disconnect failed"));
        });
    });
});
