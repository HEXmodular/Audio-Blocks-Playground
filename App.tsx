import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as Tone from 'tone'; // Added Tone import
import { BlockInstance, Connection, PendingConnection, BlockDefinition } from '@interfaces/common';
import Toolbar from '@components/Toolbar';
import BlockInstanceComponent from '@components/BlockInstanceComponent';
import GeminiChatPanel, { GeminiChatPanelRef } from '@components/GeminiChatPanel';
import BlockDetailPanel from '@components/BlockDetailPanel';
// import {
//   ALL_BLOCK_DEFINITIONS as NON_NATIVE_DEFINITIONS, // Aliased original import
// } from '@constants/constants'; // Removed unused import
// import { ALL_NATIVE_BLOCK_DEFINITIONS } from '@services/block-definitions/nativeBlockRegistry'; // Removed unused import

// Now, create the final CORE_BLOCK_DEFINITIONS_ARRAY
// const CORE_BLOCK_DEFINITIONS_ARRAY: BlockDefinition[] = [ // Removed unused variable
//   ...NON_NATIVE_DEFINITIONS,
//   ...ALL_NATIVE_BLOCK_DEFINITIONS
// ];

// import { useBlockState } from '@context/BlockStateContext'; // Removed
import { BlockStateManager } from './state/BlockStateManager'; // Added
import AudioEngineServiceInstance from '@services/AudioEngineService'; // Corrected import
import { ConnectionDragHandler } from '@utils/ConnectionDragHandler';
import { ConnectionState } from '@services/ConnectionState';
import ConnectionsRenderer from '@components/ConnectionsRenderer';
// import { LogicExecutionEngineManager } from '@services/LogicExecutionEngineManager'; // Removed
import { GlobalAudioState, GlobalAudioStateSyncer } from '@services/GlobalAudioStateSyncer';
import { AudioNodeManager } from '@services/AudioNodeManager';
import { BlockInstanceController } from '@controllers/BlockInstanceController';

const App: React.FC = () => {
  const geminiChatPanelRef = useRef<GeminiChatPanelRef>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isGeminiPanelOpen, setIsGeminiPanelOpen] = useState(false);
  const [isTestRunnerOpen, setIsTestRunnerOpen] = useState(false);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [globalBpm, setGlobalBpm] = useState<number>(120);

  // State for definitions and instances
  const [appBlockDefinitions, setAppBlockDefinitions] = useState<BlockDefinition[]>([]);
  const [appBlockInstances, setAppBlockInstances] = useState<BlockInstance[]>([]);

  // Get BlockStateManager instance
  const blockStateManager = useMemo(() => BlockStateManager.getInstance(), []);

  // Initialize BlockStateManager callbacks
  useEffect(() => {
    blockStateManager.init(setAppBlockDefinitions, setAppBlockInstances);
  }, [blockStateManager]);

  // Update related variables
  const ctxBlockStateManager = blockStateManager;
  const ctxUpdateBlockDefinition = blockStateManager.updateBlockDefinition.bind(blockStateManager);
  const ctxGetDefinitionById = blockStateManager.getDefinitionForBlock.bind(blockStateManager);


  const globalAudioStateSyncer = useMemo(() => {
    return new GlobalAudioStateSyncer(AudioEngineServiceInstance);
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
    return appBlockDefinitions.find(def => def.id === instance.definitionId); // Use new state
  }, [appBlockDefinitions]); // Use new state

  const connectionState = useMemo(() => new ConnectionState(), []);
  const [connections, setConnections] = useState<Connection[]>(() => connectionState.getConnections());

  useEffect(() => {
    const unsubscribe = connectionState.onStateChange(setConnections);
    return unsubscribe;
  }, [connectionState]);

  // const coreDefinitionIds = useMemo(() => new Set(CORE_BLOCK_DEFINITIONS_ARRAY.map(def => def.id)), []); // Removed unused variable

  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  const [draggedOverPort, setDraggedOverPort] = useState<{ instanceId: string; portId: string } | null>(null);

  const connectionDragHandler = useMemo(() => {
    const handler = new ConnectionDragHandler({
      svgRef: svgRef as React.RefObject<SVGSVGElement>,
      blockInstances: appBlockInstances, // Use new state
      getDefinitionForBlock,
      updateConnections: connectionState.updateConnections,
      onStateChange: () => {
        setPendingConnection(handler.pendingConnection);
        setDraggedOverPort(handler.draggedOverPort);
      },
    });
    return handler;
  }, [appBlockInstances, getDefinitionForBlock, connectionState]); // Use new state

  useEffect(() => {
    return () => {
      connectionDragHandler.dispose();
    };
  }, [connectionDragHandler]);

  const blockInstanceController = useMemo(() => {
    if (!ctxBlockStateManager || !connectionState) return null;
    return new BlockInstanceController(
      ctxBlockStateManager,
      AudioEngineServiceInstance,
      connectionState,
      setSelectedInstanceId,
      () => globalBpm,
      () => appBlockInstances // Use new state
    );
  }, [ctxBlockStateManager, connectionState, globalBpm, appBlockInstances]); // Use new state

  // const logicExecutionEngineManager = useMemo(() => { // Removed
  //   if (ctxBlockStateManager) {
  //     return new LogicExecutionEngineManager(
  //       ctxBlockStateManager,
  //       getDefinitionForBlock
  //     );
  //   }
  //   return null;
  // }, [ctxBlockStateManager, getDefinitionForBlock]);

  // useEffect(() => { // Removed
  //   if (logicExecutionEngineManager) {
  //     logicExecutionEngineManager.updateCoreDependencies(
  //       appBlockInstances, // Use new state
  //       connections,
  //       globalBpm,
  //       syncedGlobalAudioState.isAudioGloballyEnabled
  //     );
  //   }
  // }, [
  //   logicExecutionEngineManager,
  //   // appBlockInstances, // Use new state
  //   connections,
  //   globalBpm,
  //   syncedGlobalAudioState.isAudioGloballyEnabled
  // ]);

  // useEffect(() => { // Removed
  //   return () => {
  //     if (logicExecutionEngineManager) {
  //       logicExecutionEngineManager.dispose();
  //     }
  //   };
  // }, [logicExecutionEngineManager]);

  const audioNodeManager = useMemo(() => {
    if (!ctxBlockStateManager || !ctxGetDefinitionById) return null;
    return new AudioNodeManager(AudioEngineServiceInstance, ctxBlockStateManager, ctxGetDefinitionById);
  }, [ctxBlockStateManager, ctxGetDefinitionById]);

  useEffect(() => {
    // Use Tone.getContext() for checks related to audio context readiness
    if (!audioNodeManager || !Tone.getContext()) return;
    const setupNodes = async () => {
      try {
        await audioNodeManager.processAudioNodeSetupAndTeardown(
          appBlockInstances, // Use new state
          globalBpm,
          syncedGlobalAudioState.isAudioGloballyEnabled,
          AudioEngineServiceInstance.audioWorkletManager.isAudioWorkletSystemReady,
          Tone.getContext()
        );
      } catch (error) {
        console.error("Error during processAudioNodeSetupAndTeardown:", error);
        setGlobalError("Failed to process audio nodes: " + (error as Error).message);
      }
    };
    setupNodes();
  }, [
    audioNodeManager, // Ensure this is uncommented
    appBlockInstances, // Ensure this is uncommented
    globalBpm,
    syncedGlobalAudioState.isAudioGloballyEnabled,
    AudioEngineServiceInstance.audioWorkletManager.isAudioWorkletSystemReady,
    AudioEngineServiceInstance.context,
  ]);

  // useEffect(() => {
  //   console.log("audioNodeManager changed");
  // },[audioNodeManager])
  // useEffect(() => {
  //   console.log("appBlockInstances changed");
  // }, [appBlockInstances])
  // useEffect(() => {
  //   console.log("globalBpm changed");
  // },[globalBpm])
  // useEffect(() => {
  //   console.log("syncedGlobalAudioState.isAudioGloballyEnabled changed");
  // },[syncedGlobalAudioState.isAudioGloballyEnabled])
  // useEffect(() => {
  //   console.log("syncedGlobalAudioState.isAudioGloballyEnabled changed");
  // },[AudioEngineServiceInstance.audioWorkletManager.isAudioWorkletSystemReady]) // Assuming audioWorkletManager is a property
  // useEffect(() => {
  //   console.log("audioEngineService.audioContext changed");
  // },[AudioEngineServiceInstance.context]) // Assuming AudioEngineService stores the Tone.Context as 'context'

  useEffect(() => {
    if (!audioNodeManager) return;
    audioNodeManager.updateAudioNodeParameters(
      appBlockInstances, // Use new state
      connections,
      globalBpm
    );
  }, [
    // audioNodeManager,
    appBlockInstances, // Use new state
    connections,
    globalBpm,
  ]);

  useEffect(() => {
    if (!audioNodeManager) return;
    audioNodeManager.manageLyriaServiceUpdates(
      appBlockInstances, // Use new state
      connections,
      syncedGlobalAudioState.isAudioGloballyEnabled
    );
  }, [
    // audioNodeManager,
    // appBlockInstances, // Use new state
    connections,
    syncedGlobalAudioState.isAudioGloballyEnabled,
  ]);

  useEffect(() => {
    if (!audioNodeManager) return;
    audioNodeManager.updateAudioGraphConnections(
      connections,
      appBlockInstances, // Use new state
      syncedGlobalAudioState.isAudioGloballyEnabled
    );
  }, [
    // audioNodeManager,
    connections,
    // appBlockInstances, // Use new state
    syncedGlobalAudioState.isAudioGloballyEnabled,
  ]);

  const selectedBlockInstance = useMemo(() => {
    return appBlockInstances.find(b => b?.instanceId === selectedInstanceId) || null;
  }, [appBlockInstances, selectedInstanceId]); // Use new state

  // Check based on Tone.getContext()
  if (!syncedGlobalAudioState.audioContextState && !Tone.getContext()) {
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
        onToggleGlobalAudio={AudioEngineServiceInstance.toggleGlobalAudio} // Assuming this method exists
        isAudioGloballyEnabled={syncedGlobalAudioState.isAudioGloballyEnabled}
        onToggleTestRunner={() => setIsTestRunnerOpen(!isTestRunnerOpen)}
        // coreDefinitionIds={coreDefinitionIds} // Removed prop
        availableOutputDevices={syncedGlobalAudioState.availableOutputDevices}
        onSetOutputDevice={async (sinkId: string): Promise<boolean> => {
          try {
            await AudioEngineServiceInstance.setOutputDevice(sinkId); // Assuming this method exists
            return true;
          } catch (error) {
            console.error("Failed to set output device from Toolbar:", error);
            setGlobalError(`Failed to set output device: ${(error as Error).message}`);
            return false;
          }
        }}
        appBlockDefinitionsFromCtx={appBlockDefinitions}
        appBlockInstancesFromCtx={appBlockInstances}
        connections={connections}
        globalBpm={globalBpm}
        selectedSinkId={syncedGlobalAudioState.selectedSinkId || ""}
        audioEngineService={AudioEngineServiceInstance}
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
            blockInstances={appBlockInstances}
            getDefinitionForBlock={getDefinitionForBlock}
            onUpdateConnections={connectionState.updateConnections}
          />
        </svg>

        {appBlockInstances.filter(instance => instance).map(instance => (
          <BlockInstanceComponent
            key={instance.instanceId}
            blockInstance={instance}
            isSelected={instance.instanceId === selectedInstanceId}
            getDefinitionForBlock={getDefinitionForBlock}
            onSelect={(id: string | null) => setSelectedInstanceId(id)}
            onUpdateInstancePosition={blockInstanceController?.updateInstance!}
            onDeleteInstance={(instanceId: string) => blockInstanceController?.deleteInstance(instanceId, selectedInstanceId)}
            onStartConnectionDrag={connectionDragHandler.handleStartConnectionDrag}
            pendingConnectionSource={pendingConnection ? { instanceId: pendingConnection.fromInstanceId, portId: pendingConnection.fromPort.id } : null}
            draggedOverPort={draggedOverPort}
          />
        ))}
      </main>

      {selectedBlockInstance && ctxBlockStateManager && (
        <BlockDetailPanel
          blockInstance={selectedBlockInstance}
          blockInstances={appBlockInstances} // Added prop
          connections={connections}
          onClosePanel={() => setSelectedInstanceId(null)}
          onUpdateConnections={connectionState.updateConnections}
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
          const instance = appBlockInstances.find(i => i.instanceId === instanceId); // Use new state
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
