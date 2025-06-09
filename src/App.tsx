
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { BlockInstance, BlockView, Connection, BlockDefinition, BlockPort, BlockParameter, PendingConnection, GeminiRequest } from './types';
import Toolbar from './components/Toolbar';
import BlockInstanceComponent, { getPortColor as getBlockPortBgColor } from './components/BlockInstanceComponent';
import GeminiChatPanel, { GeminiChatPanelRef } from './components/GeminiChatPanel';
import TestRunnerModal from './components/TestRunnerModal';
import BlockDetailPanel from './components/BlockDetailPanel';

// CORE_BLOCK_DEFINITIONS_ARRAY is no longer imported from constants.
// BlockStateManager is now the source of truth for all definitions.
// App.tsx receives definitions from BlockStateManager.

// Import specific definitions directly if they are used for specific logic beyond just listing/adding
// These are fine as they are for specific instance checks, not for populating the general list.
import { GAIN_BLOCK_DEFINITION } from './blocks/gainBlock';
import { NUMBER_TO_CONSTANT_AUDIO_BLOCK_DEFINITION } from './blocks/numberToConstantAudioBlock';
import { LYRIA_MASTER_BLOCK_DEFINITION } from './blocks/lyriaMasterBlock';
import { AUDIO_OUTPUT_BLOCK_DEFINITION } from './blocks/audioOutputBlock';
import { OSCILLOSCOPE_BLOCK_DEFINITION } from './blocks/oscilloscopeBlock';


import { getDefaultOutputValue } from './state/BlockStateManager';
import { BlockStateManager } from './state/BlockStateManager';
import { useConnectionState } from './hooks/useConnectionState';
import { AudioEngine, useAudioEngine } from './hooks/useAudioEngine'; 
import { useConnectionDragHandler } from './hooks/useConnectionDragHandler';
import { useLogicExecutionEngine } from './hooks/useLogicExecutionEngine';

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

  const [appBlockDefinitions, setAppBlockDefinitions] = useState<BlockDefinition[]>([]);
  const [appBlockInstances, setAppBlockInstances] = useState<BlockInstance[]>([]);

  const [audioEngineStateRevision, setAudioEngineStateRevision] = useState(0);

  const appLogCallback = useCallback((message: string, isSystem = false) => {
    if (isSystem && geminiChatPanelRef.current) {
        geminiChatPanelRef.current.addSystemMessage(message);
    } else {
        console.log(`[App${isSystem ? '-SYS' : ''}] ${message}`);
    }
  }, []);

  const handleAudioEngineStateChange = useCallback(() => {
    setAudioEngineStateRevision(prev => prev + 1);
  }, []);

  const audioEngine = useAudioEngine(appLogCallback, handleAudioEngineStateChange);


  useEffect(() => {
    if (audioEngine) {
      audioEngine.initializeBasicAudioContext().then(() => {
        audioEngine.listOutputDevices();
      });
    }
  }, [audioEngine]);


  const blockStateManager = useMemo(() => {
    return new BlockStateManager(setAppBlockDefinitions, setAppBlockInstances);
  }, []);


  const getDefinitionForBlock = useCallback((instance: BlockInstance) => {
    return appBlockDefinitions.find(def => def.id === instance.definitionId);
  }, [appBlockDefinitions]);

  const getDefinitionById = useCallback((definitionId: string) => {
    return appBlockDefinitions.find(def => def.id === definitionId);
  }, [appBlockDefinitions]);


  const {
    connections,
    updateConnections,
    setAllConnections,
  } = useConnectionState();

  // coreDefinitionIds is removed, Toolbar will use blockStateManager.isCoreDefinition
  // const coreDefinitionIds = useMemo(() => new Set(CORE_BLOCK_DEFINITIONS_ARRAY.map(def => def.id)), [CORE_BLOCK_DEFINITIONS_ARRAY]);

  const {
    pendingConnection,
    draggedOverPort,
    handleStartConnectionDrag,
  } = useConnectionDragHandler({
    svgRef,
    blockInstances: appBlockInstances,
    getDefinitionForBlock,
    updateConnections,
  });


  const handleAddBlockFromDefinition = useCallback((definition: BlockDefinition, name?: string, position?: {x:number, y:number}) => {
    if (!audioEngine) return;
    const newInstance = blockStateManager.addBlockInstance(definition, name, position);
    if (newInstance && definition.runsAtAudioRate && audioEngine.audioContext && audioEngine.audioContext.state === 'running') {
      if (definition.id === LYRIA_MASTER_BLOCK_DEFINITION.id) {
        audioEngine.setupLyriaServiceForInstance(newInstance.instanceId, definition, (msg) => blockStateManager.addLogToBlockInstance(newInstance.instanceId, msg))
          .then(success => {
            blockStateManager.updateBlockInstance(newInstance.instanceId, currentInst => ({
                ...currentInst,
                internalState: { ...currentInst.internalState, lyriaServiceReady: success, needsAudioNodeSetup: !success },
                error: success ? null : "Lyria Service setup failed."
            }));
          });
      } else if (definition.audioWorkletProcessorName && audioEngine.isAudioWorkletSystemReady) {
        audioEngine.setupManagedAudioWorkletNode(newInstance.instanceId, definition, newInstance.parameters)
          .then(success => {
            if (success) {
              blockStateManager.updateBlockInstance(newInstance.instanceId, { internalState: { ...newInstance.internalState, needsAudioNodeSetup: false } });
            }
          });
      } else if (!definition.audioWorkletProcessorName) {
        audioEngine.setupManagedNativeNode(newInstance.instanceId, definition, newInstance.parameters, globalBpm)
          .then(success => {
            if (success) {
              blockStateManager.updateBlockInstance(newInstance.instanceId, { internalState: { ...newInstance.internalState, needsAudioNodeSetup: false } });
            }
          });
      }
    } else if (newInstance && definition.runsAtAudioRate) {
        blockStateManager.updateBlockInstance(newInstance.instanceId, { internalState: { ...newInstance.internalState, needsAudioNodeSetup: true, lyriaServiceReady: false } });
    }
  }, [blockStateManager, audioEngine, globalBpm]);

  const handleUpdateInstance = useCallback((instanceId: string, updates: Partial<BlockInstance> | ((prev: BlockInstance) => BlockInstance)) => {
    blockStateManager.updateBlockInstance(instanceId, updates);
  }, [blockStateManager]);

  const handleDeleteInstance = useCallback((instanceId: string) => {
    if (!audioEngine) return;
    const instanceToRemove = appBlockInstances.find(b => b.instanceId === instanceId);
    if (instanceToRemove) {
      const definition = getDefinitionForBlock(instanceToRemove);
      if (definition?.id === LYRIA_MASTER_BLOCK_DEFINITION.id) {
        audioEngine.removeLyriaServiceForInstance(instanceId);
      } else if (definition?.audioWorkletProcessorName) {
        audioEngine.removeManagedAudioWorkletNode(instanceId);
      } else if (definition?.id.startsWith('native-') || definition?.id === GAIN_BLOCK_DEFINITION.id || definition?.id === AUDIO_OUTPUT_BLOCK_DEFINITION.id || definition?.id === OSCILLOSCOPE_BLOCK_DEFINITION.id) {
        audioEngine.removeManagedNativeNode(instanceId);
      }
    }
    blockStateManager.deleteBlockInstance(instanceId);
    updateConnections(prev => prev.filter(c => c.fromInstanceId !== instanceId && c.toInstanceId !== instanceId));
    if (selectedInstanceId === instanceId) setSelectedInstanceId(null);
  }, [blockStateManager, updateConnections, selectedInstanceId, appBlockInstances, getDefinitionForBlock, audioEngine]);


  useLogicExecutionEngine(
    appBlockInstances,
    connections,
    getDefinitionForBlock,
    blockStateManager,
    audioEngine, 
    globalBpm,
    audioEngine?.isAudioGloballyEnabled || false
  );

  useEffect(() => {
    if (!audioEngine) return; 

    // Reset setupFailed flag if audio system is not ready
    if (!audioEngine.isAudioGloballyEnabled || !audioEngine.audioContext || audioEngine.audioContext.state !== 'running') {
      appBlockInstances.forEach(instance => {
        const definition = getDefinitionForBlock(instance);
        if (definition && definition.runsAtAudioRate) {
          if (instance.internalState.needsAudioNodeSetup === false || instance.internalState.setupFailed === true) {
            handleUpdateInstance(instance.instanceId, currentInst => ({
              ...currentInst,
              internalState: {
                ...currentInst.internalState,
                needsAudioNodeSetup: true,
                setupFailed: false, // Reset setupFailed status
                lyriaServiceReady: false,
              }
            }));
          }
        }
      });
    }

    appBlockInstances.forEach(instance => {
      const definition = getDefinitionForBlock(instance);
      if (!definition) return;

      // Check for the setupFailed flag BEFORE attempting setup
      if (instance.internalState?.setupFailed) {
        // appLogCallback(`[App] Skipping setup for previously failed node ${instance.name} (${instance.instanceId}) - waiting for audio system reset.`, true);
        return;
      }

      if (definition.runsAtAudioRate && audioEngine.audioContext && audioEngine.audioContext.state === 'running' && audioEngine.isAudioGloballyEnabled) {
        const needsLyriaSetup = definition.id === LYRIA_MASTER_BLOCK_DEFINITION.id && (!instance.internalState.lyriaServiceReady || instance.internalState.needsAudioNodeSetup);
        const needsWorkletSetup = definition.audioWorkletProcessorName && instance.internalState.needsAudioNodeSetup && audioEngine.isAudioWorkletSystemReady;
        const needsNativeSetup = !definition.audioWorkletProcessorName && definition.id !== LYRIA_MASTER_BLOCK_DEFINITION.id && instance.internalState.needsAudioNodeSetup;

        if (needsLyriaSetup) { // audioEngine.isAudioGloballyEnabled is checked in outer if
          audioEngine.setupLyriaServiceForInstance(instance.instanceId, definition, (msg) => blockStateManager.addLogToBlockInstance(instance.instanceId, msg))
            .then(success => {
              handleUpdateInstance(instance.instanceId, currentInst => ({
                ...currentInst,
                internalState: {
                  ...currentInst.internalState,
                  lyriaServiceReady: success,
                  needsAudioNodeSetup: !success,
                  setupFailed: !success
                },
                error: success ? null : "Lyria Service setup failed." // Keep error for Lyria
              }));
            });
        } else if (needsWorkletSetup) {
          audioEngine.setupManagedAudioWorkletNode(instance.instanceId, definition, instance.parameters)
            .then(success => {
              if (success) {
                handleUpdateInstance(instance.instanceId, currentInst => ({
                  ...currentInst,
                  internalState: { ...currentInst.internalState, needsAudioNodeSetup: false, setupFailed: false }
                }));
              } else {
                appLogCallback(`[App] Failed to set up worklet node for ${instance.name} (${instance.instanceId}). Marking to prevent retries.`, true);
                handleUpdateInstance(instance.instanceId, currentInst => ({
                  ...currentInst,
                  internalState: { ...currentInst.internalState, needsAudioNodeSetup: true, setupFailed: true }
                }));
              }
            });
        } else if (needsNativeSetup) {
          audioEngine.setupManagedNativeNode(instance.instanceId, definition, instance.parameters, globalBpm)
            .then(success => {
              if (success) {
                handleUpdateInstance(instance.instanceId, currentInst => ({
                  ...currentInst,
                  internalState: { ...currentInst.internalState, needsAudioNodeSetup: false, setupFailed: false }
                }));
              } else {
                appLogCallback(`[App] Failed to set up native node for ${instance.name} (${instance.instanceId}). Marking to prevent retries.`, true);
                handleUpdateInstance(instance.instanceId, currentInst => ({
                  ...currentInst,
                  internalState: { ...currentInst.internalState, needsAudioNodeSetup: true, setupFailed: true }
                }));
              }
            });
        } else if (!instance.internalState.needsAudioNodeSetup && definition.id !== LYRIA_MASTER_BLOCK_DEFINITION.id) { // Node is already set up, update params
          if (definition.audioWorkletProcessorName) {
            audioEngine.updateManagedAudioWorkletNodeParams(instance.instanceId, instance.parameters);
          } else { // Native node
            const currentInputsForParamUpdate: Record<string, any> = {};
            if (definition.id === NUMBER_TO_CONSTANT_AUDIO_BLOCK_DEFINITION.id) {
                const inputPort = definition.inputs.find(ip => ip.id === 'number_in');
                if (inputPort) {
                    const conn = connections.find(c => c.toInstanceId === instance.instanceId && c.toInputId === inputPort.id);
                    if (conn) {
                        const sourceInstance = appBlockInstances.find(bi => bi.instanceId === conn.fromInstanceId);
                        currentInputsForParamUpdate[inputPort.id] = sourceInstance?.lastRunOutputs?.[conn.fromOutputId] ?? getDefaultOutputValue(inputPort.type);
                    } else {
                        currentInputsForParamUpdate[inputPort.id] = getDefaultOutputValue(inputPort.type);
                    }
                }
            }
            audioEngine.updateManagedNativeNodeParams(instance.instanceId, instance.parameters, Object.keys(currentInputsForParamUpdate).length > 0 ? currentInputsForParamUpdate : undefined, globalBpm);
          }
        }
      } else if (definition.runsAtAudioRate && (!audioEngine.isAudioGloballyEnabled || !audioEngine.audioContext || audioEngine.audioContext.state !== 'running')) {
        // This part is now handled by the loop at the beginning of the useEffect
        // However, we ensure needsAudioNodeSetup is true if it wasn't already.
        if (instance.internalState.needsAudioNodeSetup === false) {
             handleUpdateInstance(instance.instanceId, currentInst => ({
                ...currentInst,
                internalState: {
                    ...currentInst.internalState,
                    needsAudioNodeSetup: true,
                    lyriaServiceReady: false, // Reset Lyria status too
                    // setupFailed will be reset by the initial loop in this useEffect
                }
            }));
        }
      }

      // Lyria specific updates based on its internalState flags (set by its logicCode)
      if (definition.id === LYRIA_MASTER_BLOCK_DEFINITION.id) {
        const service = audioEngine.getLyriaServiceInstance(instance.instanceId);
        const servicePlaybackState = service?.getPlaybackState();
        const isServiceEffectivelyPlaying = servicePlaybackState === 'playing' || servicePlaybackState === 'loading';

        // Update block's internal 'isPlaying' based on service state
        if (instance.internalState.isPlaying !== isServiceEffectivelyPlaying) {
            handleUpdateInstance(instance.instanceId, prevState => ({
                ...prevState,
                internalState: { ...prevState.internalState, isPlaying: isServiceEffectivelyPlaying }
            }));
        }
        
        // If audio is globally enabled, tell audioEngine to process Lyria requests
        if (audioEngine.isAudioGloballyEnabled && instance.internalState.lyriaServiceReady) {
            const blockParams: Record<string, any> = {};
            instance.parameters.forEach(p => blockParams[p.id] = p.currentValue);
            const blockInputs: Record<string, any> = {}; // Collect current input values for Lyria
            definition.inputs.forEach(inputPort => {
                const conn = connections.find(c => c.toInstanceId === instance.instanceId && c.toInputId === inputPort.id);
                if (conn) {
                    const sourceInstance = appBlockInstances.find(bi => bi.instanceId === conn.fromInstanceId);
                    blockInputs[inputPort.id] = sourceInstance?.lastRunOutputs?.[conn.fromOutputId] ?? getDefaultOutputValue(inputPort.type);
                } else {
                    blockInputs[inputPort.id] = getDefaultOutputValue(inputPort.type);
                }
            });

            audioEngine.updateLyriaServiceState(
              instance.instanceId,
              instance.internalState, // Pass the full internalState which contains request flags
              blockParams,
              blockInputs,
              () => { // Callback to clear processed request flags from the block's internal state
                handleUpdateInstance(instance.instanceId, prevState => ({
                  ...prevState,
                  internalState: {
                    ...prevState.internalState,
                    playRequest: false, pauseRequest: false, stopRequest: false, reconnectRequest: false,
                    configUpdateNeeded: false, promptsUpdateNeeded: false, trackMuteUpdateNeeded: false,
                    // Note: restartRequest is consumed by the block's logicCode.
                    // autoPlayInitiated and wasPlayingBeforeGateLow are managed internally by the block's logicCode.
                  }
                }));
              }
            );
        }
      }
    });
  }, [
    audioEngine, 
    audioEngineStateRevision, 
    appBlockInstances,
    getDefinitionForBlock,
    handleUpdateInstance,
    globalBpm,
    blockStateManager, // For addLogToBlockInstance during Lyria setup
    connections // For Lyria input value collection
  ]);

  useEffect(() => {
    if (!audioEngine) return;
    if (audioEngine.isAudioGloballyEnabled) {
        audioEngine.updateAudioGraphConnections(connections, appBlockInstances, getDefinitionForBlock);
    } else {
        audioEngine.updateAudioGraphConnections([], appBlockInstances, getDefinitionForBlock); 
    }
  }, [
    connections,
    appBlockInstances,
    getDefinitionForBlock,
    audioEngine, 
    audioEngineStateRevision, 
  ]);


  const handleExportWorkspace = () => {
    if (!audioEngine) return;
    const workspace = {
      blockDefinitions: appBlockDefinitions.filter(def => def.isAiGenerated),
      blockInstances: appBlockInstances,
      connections,
      globalBpm,
      selectedSinkId: audioEngine.selectedSinkId,
    };
    const jsonString = JSON.stringify(workspace, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `audioblocks_workspace_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
    console.log("[System] Workspace exported.");
  };

  const handleImportWorkspace = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioEngine) return;
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const jsonString = e.target?.result as string;
        const workspace = JSON.parse(jsonString);

        if (!workspace || typeof workspace !== 'object') {
          throw new Error("Invalid workspace file format.");
        }

        if (audioEngine.isAudioGloballyEnabled) {
          await audioEngine.toggleGlobalAudio();
        }
        audioEngine.removeAllManagedNodes();

        const {
          blockDefinitions: importedDefinitions = [],
          blockInstances: importedInstances = [],
          connections: importedConnections = [],
          globalBpm: importedBpm,
          selectedSinkId: importedSinkId,
        } = workspace;

        // Use blockStateManager to check for core definitions when processing imported ones
        const currentDefinitions = blockStateManager.getBlockDefinitions();
        const definitionsToSet = [...currentDefinitions];
        const currentDefinitionIds = new Set(currentDefinitions.map(d => d.id));

        importedDefinitions.forEach((def: BlockDefinition) => {
          if (!currentDefinitionIds.has(def.id)) {
            definitionsToSet.push({...def, isAiGenerated: true });
            currentDefinitionIds.add(def.id);
          }
        });
        blockStateManager.setAllBlockDefinitions(definitionsToSet);

        blockStateManager.setAllBlockInstances(importedInstances.map((inst: BlockInstance) => ({
            ...inst,
            internalState: {
                ...(inst.internalState || {}),
                needsAudioNodeSetup: true,
                audioWorkletNodeId: undefined,
                lyriaServiceInstanceId: undefined,
                lyriaServiceReady: false,
                autoPlayInitiated: false, // Ensure this is part of initial state on load for Lyria
                wasPlayingBeforeGateLow: false, // Ensure this is part of initial state on load for Lyria
            },
            logs: inst.logs || [`Instance '${inst.name}' loaded from file.`],
            modificationPrompts: inst.modificationPrompts || [],
        })));
        setAllConnections(importedConnections);

        if (typeof importedBpm === 'number' && importedBpm > 0) {
            setGlobalBpm(importedBpm);
        }

        if (typeof importedSinkId === 'string' && audioEngine.availableOutputDevices.find(d => d.deviceId === importedSinkId)) {
            await audioEngine.setOutputDevice(importedSinkId);
        } else if (importedSinkId) {
            console.warn(`[System] Imported sinkId "${importedSinkId}" not available. Using default.`);
            await audioEngine.setOutputDevice('default');
        }

        console.log("[System] Workspace imported successfully.");
        setSelectedInstanceId(null);

      } catch (err) {
        console.error("Error importing workspace:", err);
        alert(`Error importing workspace: ${(err as Error).message}`);
      } finally {
        if (event.target) event.target.value = "";
      }
    };
    reader.readAsText(file);
  };

  const selectedBlockInstance = useMemo(() => {
    return appBlockInstances.find(b => b.instanceId === selectedInstanceId) || null;
  }, [appBlockInstances, selectedInstanceId]);

  const getPortElementCenterForConnectionLine = (portElement: Element): { x: number; y: number } => {
    const rect = portElement.getBoundingClientRect();
    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return { x: 0, y: 0 };
    return {
      x: rect.left + rect.width / 2 - svgRect.left,
      y: rect.top + rect.height / 2 - svgRect.top,
    };
  };

  if (!audioEngine) {
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
        onAddBlockFromDefinition={handleAddBlockFromDefinition}
        onToggleGeminiPanel={() => setIsGeminiPanelOpen(!isGeminiPanelOpen)}
        isGeminiPanelOpen={isGeminiPanelOpen}
        onToggleGlobalAudio={audioEngine.toggleGlobalAudio}
        isAudioGloballyEnabled={audioEngine.isAudioGloballyEnabled}
        onToggleTestRunner={() => setIsTestRunnerOpen(!isTestRunnerOpen)}
        allBlockDefinitions={appBlockDefinitions}
        onExportWorkspace={handleExportWorkspace}
        onImportWorkspace={handleImportWorkspace}
        onDeleteBlockDefinition={blockStateManager.deleteBlockDefinition}
        isCoreDefinition={blockStateManager.isCoreDefinition.bind(blockStateManager)}
        bpm={globalBpm}
        onBpmChange={setGlobalBpm}
        availableOutputDevices={audioEngine.availableOutputDevices}
        selectedSinkId={audioEngine.selectedSinkId}
        onSetOutputDevice={audioEngine.setOutputDevice}
      />
      <main className="flex-grow pt-14 relative" id="main-workspace-area">
        <svg ref={svgRef} className="absolute inset-0 w-full h-full pointer-events-none">
          {connections.map(conn => {
            const fromInstance = appBlockInstances.find(b => b.instanceId === conn.fromInstanceId);
            const toInstance = appBlockInstances.find(b => b.instanceId === conn.toInstanceId);
            if (!fromInstance || !toInstance) return null;

            const fromDef = getDefinitionForBlock(fromInstance);
            const toDef = getDefinitionForBlock(toInstance);
            if (!fromDef || !toDef) return null;

            const outputPortDef = fromDef.outputs.find(p => p.id === conn.fromOutputId);
            const inputPortDef = toDef.inputs.find(p => p.id === conn.toInputId);
            if (!outputPortDef || !inputPortDef) return null;

            const outputPortElem = document.querySelector(`[data-instance-id="${conn.fromInstanceId}"] [data-port-id="${conn.fromOutputId}"]`);
            const inputPortElem = document.querySelector(`[data-instance-id="${conn.toInstanceId}"] [data-port-id="${conn.toInputId}"]`);
            if (!outputPortElem || !inputPortElem) return null;

            const startPos = getPortElementCenterForConnectionLine(outputPortElem);
            const endPos = getPortElementCenterForConnectionLine(inputPortElem);

            const portColor = getBlockPortBgColor(outputPortDef.type).replace('bg-', 'stroke-');

            return (
              <line
                key={conn.id}
                x1={startPos.x} y1={startPos.y}
                x2={endPos.x} y2={endPos.y}
                className={`connection-line ${portColor} opacity-70 hover:opacity-100`}
                strokeWidth="3"
                onDoubleClick={() => updateConnections(prev => prev.filter(c => c.id !== conn.id))}
                style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                aria-label={`Connection from ${fromInstance.name} (${outputPortDef.name}) to ${toInstance.name} (${inputPortDef.name}). Double-click to delete.`}
              />
            );
          })}
          {pendingConnection && (
            <line
              x1={pendingConnection.startX} y1={pendingConnection.startY}
              x2={pendingConnection.currentX} y2={pendingConnection.currentY}
              className={`connection-line stroke-dashed ${getBlockPortBgColor(pendingConnection.fromPort.type).replace('bg-', 'stroke-')}`}
              strokeWidth="2.5"
            />
          )}
        </svg>

        {appBlockInstances.map(instance => (
          <BlockInstanceComponent
            key={instance.instanceId}
            blockInstance={instance}
            isSelected={instance.instanceId === selectedInstanceId}
            getDefinitionForBlock={getDefinitionForBlock}
            onSelect={setSelectedInstanceId}
            onUpdateInstancePosition={handleUpdateInstance}
            onDeleteInstance={handleDeleteInstance}
            onStartConnectionDrag={handleStartConnectionDrag}
            pendingConnectionSource={pendingConnection ? {instanceId: pendingConnection.fromInstanceId, portId: pendingConnection.fromPort.id} : null}
            draggedOverPort={draggedOverPort}
          />
        ))}
      </main>

      {selectedBlockInstance && (
        <BlockDetailPanel
          blockInstance={selectedBlockInstance}
          getBlockDefinition={getDefinitionById}
          onUpdateInstance={handleUpdateInstance}
          onDeleteInstance={handleDeleteInstance}
          allInstances={appBlockInstances}
          connections={connections}
          onClosePanel={() => setSelectedInstanceId(null)}
          onUpdateConnections={updateConnections}
          getAnalyserNodeForInstance={audioEngine.getAnalyserNodeForInstance}
        />
      )}
      <GeminiChatPanel
        ref={geminiChatPanelRef}
        isOpen={isGeminiPanelOpen}
        onToggle={() => setIsGeminiPanelOpen(!isGeminiPanelOpen)}
        selectedBlockInstance={selectedBlockInstance}
        getBlockDefinition={getDefinitionById}
        onAddBlockFromGeneratedDefinition={(definition, instanceName) => {
          handleAddBlockFromDefinition(definition, instanceName);
          setIsGeminiPanelOpen(false);
        }}
        onUpdateBlockLogicCode={(instanceId, newLogicCode, modificationPrompt) => {
          const instance = appBlockInstances.find(i => i.instanceId === instanceId);
          if (instance) {
            const definition = getDefinitionById(instance.definitionId);
            if (definition) {
              blockStateManager.updateBlockDefinition(definition.id, { logicCode: newLogicCode });
              handleUpdateInstance(instanceId, prev => ({
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
      {isTestRunnerOpen && (
        <TestRunnerModal
          isOpen={isTestRunnerOpen}
          onClose={() => setIsTestRunnerOpen(false)}
          audioEngineControls={audioEngine}
          blockInstances={appBlockInstances}
          connections={connections}
        />
      )}
    </div>
  );
};


export default App;
