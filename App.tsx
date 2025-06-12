import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { BlockInstance, Connection, PendingConnection, BlockDefinition } from '@interfaces/common';
import Toolbar from '@components/Toolbar';
import BlockInstanceComponent from '@components/BlockInstanceComponent';
import GeminiChatPanel, { GeminiChatPanelRef } from '@components/GeminiChatPanel';
import BlockDetailPanel from '@components/BlockDetailPanel';
import {
    ALL_BLOCK_DEFINITIONS as CORE_BLOCK_DEFINITIONS_ARRAY,
} from '@constants/constants';

import { useBlockState } from '@context/BlockStateContext';
import { audioEngineService } from '@services/AudioEngineService';
import { ConnectionDragHandler } from '@utils/ConnectionDragHandler';
import { ConnectionState } from '@services/ConnectionState';
import ConnectionsRenderer from '@components/ConnectionsRenderer';
import { LogicExecutionEngineManager } from '@services/LogicExecutionEngineManager';
import { GlobalAudioState, GlobalAudioStateSyncer } from '@services/GlobalAudioStateSyncer';
import { AudioNodeManager } from '@services/AudioNodeManager';
import { BlockInstanceController } from '@controllers/BlockInstanceController';

// Unused variables commented out
// const GRID_STEP = 20;
// const COMPACT_BLOCK_WIDTH = 120;


const App: React.FC = () => {
  const geminiChatPanelRef = useRef<GeminiChatPanelRef>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isGeminiPanelOpen, setIsGeminiPanelOpen] = useState(false);
  const [isTestRunnerOpen, setIsTestRunnerOpen] = useState(false);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [globalBpm, setGlobalBpm] = useState<number>(120);

  const {
    blockDefinitions: appBlockDefinitionsFromCtx,
    blockInstances: appBlockInstancesFromCtx,
    blockStateManager: ctxBlockStateManager,
    updateBlockDefinition: ctxUpdateBlockDefinition, // Keep for Gemini Panel
    getDefinitionById: ctxGetDefinitionById, // Keep for Gemini Panel & Detail Panel (now from context)
  } = useBlockState();

  const globalAudioStateSyncer = useMemo(() => {
    return new GlobalAudioStateSyncer(audioEngineService);
  }, []);

  const [syncedGlobalAudioState, setSyncedGlobalAudioState] = useState<GlobalAudioState>(globalAudioStateSyncer.currentState);

  useEffect(() => {
    const unsubscribe = globalAudioStateSyncer.subscribe(setSyncedGlobalAudioState);
    return () => {
      unsubscribe();
    };
  }, [globalAudioStateSyncer]);

  useEffect(() => {
      return () => {
          globalAudioStateSyncer.dispose();
      };
  }, [globalAudioStateSyncer]);

  const getDefinitionForBlock = useCallback((instance: BlockInstance): BlockDefinition | undefined => {
    return appBlockDefinitionsFromCtx.find(def => def.id === instance.definitionId);
  }, [appBlockDefinitionsFromCtx]);

  const connectionState = useMemo(() => new ConnectionState(), []);
  const [connections, setConnections] = useState<Connection[]>(() => connectionState.getConnections());

  useEffect(() => {
    const unsubscribe = connectionState.onStateChange(setConnections);
    return unsubscribe;
  }, [connectionState]);

  const coreDefinitionIds = useMemo(() => new Set(CORE_BLOCK_DEFINITIONS_ARRAY.map(def => def.id)), []);

  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  const [draggedOverPort, setDraggedOverPort] = useState<{ instanceId: string; portId: string } | null>(null);

  const connectionDragHandler = useMemo(() => {
    const handler = new ConnectionDragHandler({
      svgRef: svgRef as React.RefObject<SVGSVGElement>,
      blockInstances: appBlockInstancesFromCtx,
      getDefinitionForBlock,
      updateConnections: connectionState.updateConnections,
      onStateChange: () => {
        setPendingConnection(handler.pendingConnection);
        setDraggedOverPort(handler.draggedOverPort);
      },
    });
    return handler;
  }, [appBlockInstancesFromCtx, getDefinitionForBlock, connectionState]);

  useEffect(() => {
    return () => {
      connectionDragHandler.dispose();
    };
  }, [connectionDragHandler]);

  const blockInstanceController = useMemo(() => {
    if (!ctxBlockStateManager || !connectionState) return null;
    return new BlockInstanceController(
      ctxBlockStateManager,
      audioEngineService,
      connectionState,
      setSelectedInstanceId,
      () => globalBpm,
      () => appBlockInstancesFromCtx
    );
  }, [ctxBlockStateManager, connectionState, globalBpm, appBlockInstancesFromCtx]);

  const logicExecutionEngineManager = useMemo(() => {
    if (ctxBlockStateManager) {
      return new LogicExecutionEngineManager(
        ctxBlockStateManager,
        getDefinitionForBlock
      );
    }
    return null;
  }, [ctxBlockStateManager, getDefinitionForBlock]);

  useEffect(() => {
    if (logicExecutionEngineManager) {
      logicExecutionEngineManager.updateCoreDependencies(
        appBlockInstancesFromCtx,
        connections,
        globalBpm,
        syncedGlobalAudioState.isAudioGloballyEnabled
      );
    }
  }, [
    logicExecutionEngineManager,
    appBlockInstancesFromCtx,
    connections,
    globalBpm,
    syncedGlobalAudioState.isAudioGloballyEnabled
  ]);

  useEffect(() => {
    return () => {
      if (logicExecutionEngineManager) {
        logicExecutionEngineManager.dispose();
      }
    };
  }, [logicExecutionEngineManager]);

  const audioNodeManager = useMemo(() => {
    if (!ctxBlockStateManager || !ctxGetDefinitionById) return null;
    return new AudioNodeManager(audioEngineService, ctxBlockStateManager, ctxGetDefinitionById);
  }, [ctxBlockStateManager, ctxGetDefinitionById]);

  useEffect(() => {
    if (!audioNodeManager || !audioEngineService.audioContext) return;
    const setupNodes = async () => {
      try {
        await audioNodeManager.processAudioNodeSetupAndTeardown(
          appBlockInstancesFromCtx,
          globalBpm,
          syncedGlobalAudioState.isAudioGloballyEnabled,
          audioEngineService.audioWorkletManager.isAudioWorkletSystemReady,
          audioEngineService.audioContext
        );
      } catch (error) {
        console.error("Error during processAudioNodeSetupAndTeardown:", error);
        setGlobalError("Failed to process audio nodes: " + (error as Error).message);
      }
    };
    setupNodes();
  }, [
    audioNodeManager,
    appBlockInstancesFromCtx,
    globalBpm,
    syncedGlobalAudioState.isAudioGloballyEnabled,
    audioEngineService.audioWorkletManager.isAudioWorkletSystemReady,
    audioEngineService.audioContext,
  ]);

  useEffect(() => {
    if (!audioNodeManager) return;
    audioNodeManager.updateAudioNodeParameters(
      appBlockInstancesFromCtx,
      connections,
      globalBpm
    );
  }, [
    audioNodeManager,
    appBlockInstancesFromCtx,
    connections,
    globalBpm,
  ]);

  useEffect(() => {
    if (!audioNodeManager) return;
    audioNodeManager.manageLyriaServiceUpdates(
      appBlockInstancesFromCtx,
      connections,
      syncedGlobalAudioState.isAudioGloballyEnabled
    );
  }, [
    audioNodeManager,
    appBlockInstancesFromCtx,
    connections,
    syncedGlobalAudioState.isAudioGloballyEnabled,
  ]);

  useEffect(() => {
    if (!audioNodeManager) return;
    audioNodeManager.updateAudioGraphConnections(
      connections,
      appBlockInstancesFromCtx,
      syncedGlobalAudioState.isAudioGloballyEnabled
    );
  }, [
    audioNodeManager,
    connections,
    appBlockInstancesFromCtx,
    syncedGlobalAudioState.isAudioGloballyEnabled,
  ]);

  const selectedBlockInstance = useMemo(() => {
    return appBlockInstancesFromCtx.find(b => b.instanceId === selectedInstanceId) || null;
  }, [appBlockInstancesFromCtx, selectedInstanceId]);

  if (!syncedGlobalAudioState.audioContextState && audioEngineService.audioContext === null) {
    return (
      <div className="flex flex-col h-screen bg-gray-900 text-gray-100 items-center justify-center">
        Loading Audio Engine...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-100 relative overflow-hidden">
      {globalError && (
        <div className="absolute top-0 left-0 right-0 bg-red-600 text-white p-2 text-center text-sm z-50">
          Global Error: {globalError} <button onClick={() => setGlobalError(null)}>&times;</button>
        </div>
      )}
      <Toolbar
        onAddBlockFromDefinition={blockInstanceController?.addBlockFromDefinition!}
        onToggleGeminiPanel={() => setIsGeminiPanelOpen(!isGeminiPanelOpen)}
        isGeminiPanelOpen={isGeminiPanelOpen}
        onToggleGlobalAudio={audioEngineService.toggleGlobalAudio}
        isAudioGloballyEnabled={syncedGlobalAudioState.isAudioGloballyEnabled}
        onToggleTestRunner={() => setIsTestRunnerOpen(!isTestRunnerOpen)}
        coreDefinitionIds={coreDefinitionIds}
        availableOutputDevices={syncedGlobalAudioState.availableOutputDevices}
        onSetOutputDevice={async (sinkId: string): Promise<boolean> => {
          try {
            await audioEngineService.setOutputDevice(sinkId);
            return true;
          } catch (error) {
            console.error("Failed to set output device from Toolbar:", error);
            setGlobalError(`Failed to set output device: ${(error as Error).message}`);
            return false;
          }
        }}
        appBlockDefinitionsFromCtx={appBlockDefinitionsFromCtx}
        appBlockInstancesFromCtx={appBlockInstancesFromCtx}
        connections={connections}
        globalBpm={globalBpm}
        selectedSinkId={syncedGlobalAudioState.selectedSinkId || ""}
        audioEngineService={audioEngineService}
        ctxBlockStateManager={ctxBlockStateManager}
        connectionState={connectionState}
        setGlobalBpm={setGlobalBpm}
        setSelectedInstanceId={setSelectedInstanceId}
      />
      <main className="flex-grow pt-14 relative" id="main-workspace-area">
        <svg ref={svgRef} className="absolute inset-0 w-full h-full pointer-events-none">
          <ConnectionsRenderer
            svgRef={svgRef as React.RefObject<SVGSVGElement>}
            connections={connections}
            pendingConnection={pendingConnection}
            blockInstances={appBlockInstancesFromCtx}
            getDefinitionForBlock={getDefinitionForBlock}
            onUpdateConnections={connectionState.updateConnections}
          />
        </svg>

        {appBlockInstancesFromCtx.map(instance => (
          <BlockInstanceComponent
            key={instance.instanceId}
            blockInstance={instance}
            isSelected={instance.instanceId === selectedInstanceId}
            getDefinitionForBlock={getDefinitionForBlock}
            onSelect={(id: string | null) => setSelectedInstanceId(id)}
            onUpdateInstancePosition={blockInstanceController?.updateInstance!}
            onDeleteInstance={(instanceId: string) => blockInstanceController?.deleteInstance(instanceId, selectedInstanceId)}
            onStartConnectionDrag={connectionDragHandler.handleStartConnectionDrag}
            pendingConnectionSource={pendingConnection ? {instanceId: pendingConnection.fromInstanceId, portId: pendingConnection.fromPort.id} : null}
            draggedOverPort={draggedOverPort}
          />
        ))}
      </main>

      {selectedBlockInstance && ctxBlockStateManager && (
        <BlockDetailPanel
          blockInstance={selectedBlockInstance}
          // getBlockDefinition, onUpdateInstance, onDeleteInstance, allInstances are now sourced from context
          connections={connections}
          onClosePanel={() => setSelectedInstanceId(null)}
           onUpdateConnections={connectionState.updateConnections}
          getAnalyserNodeForInstance={audioEngineService.nativeNodeManager.getAnalyserNodeForInstance}
        />
      )}
      <GeminiChatPanel
        ref={geminiChatPanelRef}
        isOpen={isGeminiPanelOpen}
        onToggle={() => setIsGeminiPanelOpen(!isGeminiPanelOpen)}
        selectedBlockInstance={selectedBlockInstance}
        // getBlockDefinition is now sourced from context
        onAddBlockFromGeneratedDefinition={(definition, instanceName) => {
          blockInstanceController?.addBlockFromDefinition(definition, instanceName);
          setIsGeminiPanelOpen(false);
        }}
        onUpdateBlockLogicCode={(instanceId: string, newLogicCode: string, modificationPrompt: string) => {
          const instance = appBlockInstancesFromCtx.find(i => i.instanceId === instanceId);
          if (instance && blockInstanceController && ctxGetDefinitionById && ctxUpdateBlockDefinition) {
            const definition = ctxGetDefinitionById(instance.definitionId);
            if (definition) {
              ctxUpdateBlockDefinition(definition.id, { logicCode: newLogicCode });
              blockInstanceController.updateInstance(instanceId, prev => ({
                ...prev,
                modificationPrompts: [...(prev.modificationPrompts || []), modificationPrompt],
                error: null,
              }));
              console.log(`[System] Logic code for block '${instance.name}' (def: ${definition.id}) updated by AI.`);
            }
          }
        }}
        apiKeyMissing={!process.env.API_KEY}
      />
    </div>
  );
};

export default App;
