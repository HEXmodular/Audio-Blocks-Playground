import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getContext } from 'tone';
import {
  ReactFlow,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  reconnectEdge,
  Background,
  BackgroundVariant
} from '@xyflow/react';

import Toolbar from '@components/Toolbar';
import BlockDetailPanel from '@components/BlockDetailPanel';
import BaseNode from '@components/BaseNode';

import { Connection } from '@interfaces/connection';
import { BlockInstance } from '@interfaces/block';

import BlockStateManager from '@state/BlockStateManager';

import ConnectionState from '@services/ConnectionState';
import PubSubService from '@services/PubSubService';
import AudioEngineService from '@services/AudioEngineService';

import styles from './App.module.css';
import '@xyflow/react/dist/style.css';

const nodeTypes = {
  base: BaseNode,
};

const App: React.FC = () => {
  const edgeReconnectSuccessful = useRef(true);
  const isAudioContextSuspended = getContext().state === 'suspended';

  const [engineStarted, setEngineStarted] = useState<boolean>(false);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>();
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);

  const updateNodes = (appBlockInstances: BlockInstance[]) => {
    setNodes(appBlockInstances
      .filter(instance => instance.instanceId)
      .map(instance => ({
        id: instance.instanceId,
        position: { x: instance.position?.x, y: instance.position?.y },
        data: { label: instance.name, definition: instance.definition },
        type: 'base'
      })))
  };

  // TODO сделать адаптер для перевода из разных форматов
  const updateEdges = (connections: Connection[]) => {
    setEdges(connections?.map(connection => ({
      id: connection.id,
      source: connection.fromInstanceId,
      target: connection.toInstanceId,
      sourceHandle: connection.fromOutputId,
      targetHandle: connection.toInputId,
    })));
  }

  useEffect(() => {
    updateNodes(BlockStateManager.getBlockInstances());
    updateEdges(ConnectionState.getConnections());
  }, []);

  // useEffect(() => {
  //   updateNodes(BlockStateManager.getBlockInstances());
  // }, [BlockStateManager.getBlockInstances()]);

  // механизм для обновления только одного блока
  PubSubService.subscribe('insctance-changed', (instance: BlockInstance) => {
    // if (instance === undefined) {
    //   debugger
    //   return;
    // }
    if (!instance.instanceId) return;
    const node = {
      id: instance.instanceId,
      position: { x: instance.position?.x, y: instance.position?.y },
      data: { label: instance.name, definition: instance.definition },
      type: 'base'
    }
    setNodes([...nodes, node]);
  });

  // PubSubService.subscribe('insctances-changed', (instances: BlockInstance[]) => {
  //   updateNodes(instances);
  // });

  PubSubService.subscribe('connections-changed', (connections: Connection[]) => {
    // console.log("connections-changed", connections);
  })

  const handleEngineStarted = useCallback(() => {
    AudioEngineService.initialize();
    setEngineStarted(true);
  }, []);

  if (!isAudioContextSuspended && !engineStarted) {
    handleEngineStarted();
  }

  const onNodesChange = useCallback(
    (changes: any) => setNodes((nodesSnapshot) => {
      const nodes = applyNodeChanges(changes, nodesSnapshot)

      const positionChange =  changes.find((change: any) => change.type === 'position')
      if (!positionChange) return nodes;

      const {id, position} = positionChange;
      BlockStateManager.updateBlockInstance(id, {position})

      return nodes
    }), [],
  );

  const onEdgesChange = useCallback(
    (changes: any) => setEdges((edgesSnapshot) => applyEdgeChanges(changes, edgesSnapshot)),
    [],
  );

  const updateConnections = (edges) => {
    const connections = edges.map(connection => ({
      id: connection.id,
      fromInstanceId: connection.source,
      toInstanceId: connection.target,
      fromOutputId: connection.sourceHandle,
      toInputId: connection.targetHandle,
    }))
    ConnectionState.updateConnections(connections);
  }

  const onConnect = useCallback(
    (params) => setEdges((edgesSnapshot) => {
      const edges = addEdge(params, edgesSnapshot)
      updateConnections(edges);
      return edges
    }), [],
  );

  const onReconnectStart = useCallback(() => {
    edgeReconnectSuccessful.current = false;
  }, []);

  const onReconnect = useCallback((oldEdge, newConnection) => {
    edgeReconnectSuccessful.current = true;
    setEdges((els) => {
      const edges = reconnectEdge(oldEdge, newConnection, els)
      updateConnections(edges);
      return els;
    });
  }, []);

  const onReconnectEnd = useCallback((_, edge) => {
    if (!edgeReconnectSuccessful.current) {
      setEdges((eds) => {
        const edges = eds.filter((e) => e.id !== edge.id)
        updateConnections(edges);
        return edges;
      });
    }

    edgeReconnectSuccessful.current = true;
  }, []);

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-100 relative overflow-hidden">

      {!engineStarted && (
        <div onClick={handleEngineStarted} className={styles.engineStarted}>
          <div className={styles.engineStartedText}
          >Click to start audio engine</div>
        </div>
      )}

      <Toolbar />
      <div style={{ width: '100vw', height: '100vh' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onReconnect={onReconnect}
          onReconnectStart={onReconnectStart}
          onReconnectEnd={onReconnectEnd}
          snapToGrid
          fitView
        >
          <Background color="#999" variant={BackgroundVariant.Dots} />
        </ReactFlow>
      </div>

      {selectedInstanceId && <BlockDetailPanel
        selectedInstanceId={selectedInstanceId}
        onClosePanel={() => {
          setSelectedInstanceId(null);
        }}
        onDeleteBlockInstance={() => {
          setSelectedInstanceId(null);
        }}
      />}
    </div>
  );
};

export default App;
