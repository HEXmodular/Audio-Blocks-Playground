import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { BlockInstance, Connection, PendingConnection } from '@interfaces/common';
import Toolbar from '@components/Toolbar';
import BlockInstanceComponent from '@components/BlockInstanceComponent';
import GeminiChatPanel, { GeminiChatPanelRef } from '@components/GeminiChatPanel';
import BlockDetailPanel from '@components/BlockDetailPanel';
import {
    ALL_BLOCK_DEFINITIONS as CORE_BLOCK_DEFINITIONS_ARRAY,
} from '@constants/constants';

// import { getDefaultOutputValue } from './state/BlockStateManager'; // No longer used directly in App.tsx
import { useBlockState } from '@context/BlockStateContext';
import { audioEngineService } from '@services/AudioEngineService'; // Replaced useAudioEngine
import { ConnectionDragHandler } from '@utils/ConnectionDragHandler'; // Changed import
// import { useLogicExecutionEngine } from './hooks/useLogicExecutionEngine'; // Removed
// import { LogicExecutionService } from '@services/LogicExecutionService'; // Removed as manager encapsulates it
import { ConnectionState } from '@services/ConnectionState';
import ConnectionsRenderer from '@components/ConnectionsRenderer';
import { LogicExecutionEngineManager } from '@services/LogicExecutionEngineManager';
import { GlobalAudioState, GlobalAudioStateSyncer } from '@services/GlobalAudioStateSyncer';
import { AudioNodeManager } from '@services/AudioNodeManager';
import { BlockInstanceController } from '@controllers/BlockInstanceController';
// WorkspacePersistenceManager import removed

const GRID_STEP = 20;
const COMPACT_BLOCK_WIDTH = 120;


const App: React.FC = () => {
  const geminiChatPanelRef = useRef<GeminiChatPanelRef>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isGeminiPanelOpen, setIsGeminiPanelOpen] = useState(false);
  const [isTestRunnerOpen, setIsTestRunnerOpen] = useState(false);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [globalBpm, setGlobalBpm] = useState<number>(120);

  const {
    blockDefinitions: appBlockDefinitionsFromCtx,
    blockInstances: appBlockInstancesFromCtx,
    blockStateManager: ctxBlockStateManager,
    updateBlockDefinition: ctxUpdateBlockDefinition,
    getDefinitionById: ctxGetDefinitionById,
  } = useBlockState();

  // Instantiate GlobalAudioStateSyncer
  const globalAudioStateSyncer = useMemo(() => {
    return new GlobalAudioStateSyncer(audioEngineService);
  }, [audioEngineService]); // Assuming audioEngineService is stable or memoized itself

  // Create new state in App.tsx to hold synced values
  const [syncedGlobalAudioState, setSyncedGlobalAudioState] = useState<GlobalAudioState>(globalAudioStateSyncer.currentState);

  // Add a useEffect to subscribe to GlobalAudioStateSyncer
  useEffect(() => {
    const unsubscribe = globalAudioStateSyncer.subscribe(setSyncedGlobalAudioState);
    return () => {
      unsubscribe();
    };
  }, [globalAudioStateSyncer]);

  // Add a useEffect for cleanup of GlobalAudioStateSyncer
  useEffect(() => {
      return () => {
          globalAudioStateSyncer.dispose();
      };
  }, [globalAudioStateSyncer]);

  const getDefinitionForBlock = useCallback((instance: BlockInstance) => {
    return appBlockDefinitionsFromCtx.find(def => def.id === instance.definitionId);
  }, [appBlockDefinitionsFromCtx]);

  const connectionState = useMemo(() => new ConnectionState(), []);
  const [connections, setConnections] = useState<Connection[]>(() => connectionState.getConnections());

  useEffect(() => {
    const unsubscribe = connectionState.onStateChange(setConnections);
    return unsubscribe;
  }, [connectionState]);

  const coreDefinitionIds = useMemo(() => new Set(CORE_BLOCK_DEFINITIONS_ARRAY.map(def => def.id)), []);

  // New state variables for ConnectionDragHandler
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  const [draggedOverPort, setDraggedOverPort] = useState<{ instanceId: string; portId: string } | null>(null);

  // Instantiate ConnectionDragHandler
  const connectionDragHandler = useMemo(() => {
    const handler = new ConnectionDragHandler({
      svgRef,
      blockInstances: appBlockInstancesFromCtx,
      getDefinitionForBlock,
      updateConnections: connectionState.updateConnections,
      onStateChange: () => {
        setPendingConnection(handler.pendingConnection);
        setDraggedOverPort(handler.draggedOverPort);
      },
    });
    return handler;
  }, [svgRef, appBlockInstancesFromCtx, getDefinitionForBlock, connectionState]);

  // Effect to dispose ConnectionDragHandler
  useEffect(() => {
    return () => {
      connectionDragHandler.dispose();
    };
  }, [connectionDragHandler]);

  // Instantiate BlockInstanceController
  const blockInstanceController = useMemo(() => {
    if (!ctxBlockStateManager || !audioEngineService || !connectionState) return null;
    return new BlockInstanceController(
      ctxBlockStateManager,
      audioEngineService,
      connectionState,
      setSelectedInstanceId,
      () => globalBpm,
      () => appBlockInstancesFromCtx
    );
  }, [ctxBlockStateManager, audioEngineService, connectionState, globalBpm, appBlockInstancesFromCtx]);
  // setSelectedInstanceId is stable from useState, so not strictly needed in deps unless its identity changes.

  const logicExecutionEngineManager = useMemo(() => {
    if (ctxBlockStateManager) {
      return new LogicExecutionEngineManager(
        ctxBlockStateManager,
        getDefinitionForBlock
        // audioEngineService removed as per new constructor
      );
    }
    return null;
  }, [ctxBlockStateManager, getDefinitionForBlock]); // audioEngineService removed from deps if not used in constructor

  useEffect(() => {
    if (logicExecutionEngineManager) {
      logicExecutionEngineManager.updateCoreDependencies(
        appBlockInstancesFromCtx,
        connections,
        globalBpm,
        syncedGlobalAudioState.isAudioGloballyEnabled // Updated
        // audioEngineService removed as per new method signature
      );
    }
  }, [
    logicExecutionEngineManager,
    appBlockInstancesFromCtx,
    connections,
    globalBpm,
    // audioEngineService, // No longer a direct dependency for this effect if not passed to updateCoreDependencies
    syncedGlobalAudioState.isAudioGloballyEnabled // Specific state property
  ]);
// Note: audioEngineService might still be a dependency if logicExecutionEngineManager implicitly depends on it
// through its own constructor or other methods not directly called here.
// However, for the direct call to updateCoreDependencies, it's removed.
// The useMemo for logicExecutionEngineManager *does* depend on audioEngineService if it uses it internally,
// which it does, so audioEngineService should remain in *that* useMemo's dependency array if it's used by the manager's constructor.
// The original change to LogicExecutionEngineManager was to use the *imported singleton* audioEngineService,
// so it doesn't need it passed to its constructor anymore.
// Thus, removing audioEngineService from the useMemo's dependency array for LogicExecutionEngineManager is correct.

  useEffect(() => {
    return () => {
      if (logicExecutionEngineManager) {
        logicExecutionEngineManager.dispose();
      }
    };
  }, [logicExecutionEngineManager]);

  // Instantiate AudioNodeManager
  const audioNodeManager = useMemo(() => {
    if (!ctxBlockStateManager || !ctxGetDefinitionById) return null; // Add null check for ctxGetDefinitionById
    return new AudioNodeManager(audioEngineService, ctxBlockStateManager, ctxGetDefinitionById);
  }, [audioEngineService, ctxBlockStateManager, ctxGetDefinitionById]); // Add ctxGetDefinitionById to dependency array

  // Effect for audio node setup and teardown
  useEffect(() => {
    if (!audioNodeManager) return;
    const setupNodes = async () => {
      try {
        await audioNodeManager.processAudioNodeSetupAndTeardown(
          appBlockInstancesFromCtx,
          globalBpm,
          syncedGlobalAudioState.isAudioGloballyEnabled,
          syncedGlobalAudioState.isWorkletSystemReady,
          audioEngineService.audioContext
        );
      } catch (error) {
        console.error("Error during processAudioNodeSetupAndTeardown:", error);
        // Optionally, you could set a global error state here if the app has one
        // For example: setGlobalError("Failed to process audio nodes: " + (error as Error).message);
      }
    };
    setupNodes();
  }, [
    // audioNodeManager,
    //appBlockInstancesFromCtx,
    globalBpm,
    syncedGlobalAudioState.isAudioGloballyEnabled,
    syncedGlobalAudioState.isWorkletSystemReady,
    audioEngineService.audioContext, // Dependency for audio context state changes
  ]);

  // Effect for updating audio node parameters
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

  // Effect for Lyria service updates
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

  // Effect for updating audio graph connections
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

  // WorkspacePersistenceManager instantiation moved to Toolbar.tsx
  // handleImportWorkspaceTrigger removed from App.tsx (moved to Toolbar.tsx)

  const selectedBlockInstance = useMemo(() => {
    return appBlockInstancesFromCtx.find(b => b.instanceId === selectedInstanceId) || null;
  }, [appBlockInstancesFromCtx, selectedInstanceId]);

  // Use syncedGlobalAudioState here, check for null initially before syncer hydrates.
  // The syncer initializes state immediately, so audioContextState should be available after first render.
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
        isAudioGloballyEnabled={syncedGlobalAudioState.isAudioGloballyEnabled} // Updated
        onToggleTestRunner={() => setIsTestRunnerOpen(!isTestRunnerOpen)}
        // allBlockDefinitions prop removed as per previous subtask (managed by Toolbar's context)
        // onExportWorkspace is now handled by Toolbar internally
        // onImportWorkspace is now handled by Toolbar internally
        coreDefinitionIds={coreDefinitionIds}
        // bpm prop renamed to globalBpm
        // onBpmChange prop renamed to setGlobalBpm
        availableOutputDevices={syncedGlobalAudioState.availableOutputDevices} // Updated
        // selectedSinkId is passed directly
        onSetOutputDevice={audioEngineService.setOutputDevice}
        // Props for WorkspacePersistenceManager that Toolbar now needs:
        appBlockDefinitionsFromCtx={appBlockDefinitionsFromCtx}
        appBlockInstancesFromCtx={appBlockInstancesFromCtx}
        connections={connections}
        globalBpm={globalBpm}
        selectedSinkId={syncedGlobalAudioState.selectedSinkId} // Pass selectedSinkId directly
        audioEngineService={audioEngineService}
        ctxBlockStateManager={ctxBlockStateManager}
        connectionState={connectionState}
        setGlobalBpm={setGlobalBpm}
        setSelectedInstanceId={setSelectedInstanceId}
      />
      <main className="flex-grow pt-14 relative" id="main-workspace-area">
        <svg ref={svgRef} className="absolute inset-0 w-full h-full pointer-events-none">
          <ConnectionsRenderer
            svgRef={svgRef}
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
            onSelect={setSelectedInstanceId}
            onUpdateInstancePosition={blockInstanceController?.updateInstance!}
            onDeleteInstance={(instanceId) => blockInstanceController?.deleteInstance(instanceId, selectedInstanceId)}
            onStartConnectionDrag={connectionDragHandler.handleStartConnectionDrag}
            pendingConnectionSource={pendingConnection ? {instanceId: pendingConnection.fromInstanceId, portId: pendingConnection.fromPort.id} : null}
            draggedOverPort={draggedOverPort}
          />
        ))}
      </main>

      {selectedBlockInstance && (
        <BlockDetailPanel
          blockInstance={selectedBlockInstance}
          getBlockDefinition={ctxGetDefinitionById}
          onUpdateInstance={blockInstanceController?.updateInstance!}
          onDeleteInstance={(instanceId) => blockInstanceController?.deleteInstance(instanceId, selectedInstanceId)}
          allInstances={appBlockInstancesFromCtx}
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
        getBlockDefinition={ctxGetDefinitionById}
        onAddBlockFromGeneratedDefinition={(definition, instanceName) => {
          blockInstanceController?.addBlockFromDefinition(definition, instanceName);
          setIsGeminiPanelOpen(false);
        }}
        onUpdateBlockLogicCode={(instanceId, newLogicCode, modificationPrompt) => {
          const instance = appBlockInstancesFromCtx.find(i => i.instanceId === instanceId);
          if (instance && blockInstanceController) {
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
