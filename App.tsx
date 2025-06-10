
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { BlockInstance, BlockView, Connection, BlockDefinition, BlockPort, BlockParameter, PendingConnection, GeminiRequest } from './types';
import Toolbar from './components/Toolbar';
import BlockInstanceComponent, { getPortColor as getBlockPortBgColor } from './components/BlockInstanceComponent';
import GeminiChatPanel, { GeminiChatPanelRef } from './components/GeminiChatPanel';
import TestRunnerModal from './components/TestRunnerModal';
import BlockDetailPanel from './components/BlockDetailPanel';
import {
    AUDIO_OUTPUT_BLOCK_DEFINITION,
    OSCILLATOR_BLOCK_DEFINITION,
    NATIVE_OSCILLATOR_BLOCK_DEFINITION,
    NATIVE_BIQUAD_FILTER_BLOCK_DEFINITION,
    NATIVE_DELAY_BLOCK_DEFINITION,
    NATIVE_ALLPASS_FILTER_BLOCK_DEFINITION,
    GAIN_BLOCK_DEFINITION,
    ALL_BLOCK_DEFINITIONS as CORE_BLOCK_DEFINITIONS_ARRAY,
    OSCILLOSCOPE_BLOCK_DEFINITION,
    NATIVE_LFO_BLOCK_DEFINITION,
    NATIVE_LFO_BPM_SYNC_BLOCK_DEFINITION,
    NATIVE_AD_ENVELOPE_BLOCK_DEFINITION,
    NATIVE_AR_ENVELOPE_BLOCK_DEFINITION,
    MANUAL_GATE_BLOCK_DEFINITION,
    STEP_SEQUENCER_BLOCK_DEFINITION,
    PROBABILITY_SEQUENCER_BLOCK_DEFINITION,
    RULE_110_BLOCK_DEFINITION,
    RULE_110_OSCILLATOR_BLOCK_DEFINITION,
    RULE_110_JOIN_BLOCK_DEFINITION,
    RULE_110_BYTE_READER_BLOCK_DEFINITION,
    BYTE_REVERSE_BLOCK_DEFINITION,
    NUMBER_TO_CONSTANT_AUDIO_BLOCK_DEFINITION,
    LYRIA_MASTER_BLOCK_DEFINITION
} from './constants';

import { getDefaultOutputValue } from './state/BlockStateManager';
import { BlockStateManager } from './state/BlockStateManager';
import { useConnectionState } from './hooks/useConnectionState';
import { AudioEngine, useAudioEngine } from './hooks/useAudioEngine'; // Correctly import AudioEngine interface and useAudioEngine hook
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

  const [, forceUpdate] = React.useReducer(x => x + 1, 0); // Forcing re-render

  const appLogCallback = useCallback((message: string, isSystem = false) => {
    if (isSystem && geminiChatPanelRef.current) {
        geminiChatPanelRef.current.addSystemMessage(message);
    } else {
        console.log(`[App${isSystem ? '-SYS' : ''}] ${message}`);
    }
  }, []);

  // audioEngineStateRevision and handleAudioEngineStateChange are now removed.
  // Pass forceUpdate as the onStateChangeForReRender callback to useAudioEngine.
  // This allows sub-managers to trigger a re-render of App.tsx if necessary.
  const audioEngine = useAudioEngine(appLogCallback, forceUpdate);


  useEffect(() => {
    if (audioEngine) {
      audioEngine.initializeBasicAudioContext().then(() => {
        audioEngine.listOutputDevices();
      });
    }
    // No explicit dispose call here; assuming useAudioEngine handles its own lifecycle cleanup.
    // If useAudioEngine needs explicit cleanup, it should return a dispose function or be documented.
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

  const coreDefinitionIds = useMemo(() => new Set(CORE_BLOCK_DEFINITIONS_ARRAY.map(def => def.id)), []);

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
    audioEngine?.audioContextManager.isAudioGloballyEnabled
  );

  // New useEffect for Audio Node Setup
  useEffect(() => {
    if (!audioEngine || !audioEngine.audioContextManager.audioContext) {
        appBlockInstances.forEach(instance => {
            const definition = getDefinitionForBlock(instance);
            if (definition && definition.runsAtAudioRate && !instance.internalState.needsAudioNodeSetup) {
                 handleUpdateInstance(instance.instanceId, { internalState: { ...instance.internalState, needsAudioNodeSetup: true, lyriaServiceReady: false, autoPlayInitiated: false } });
            }
        });
        return;
    }

    appBlockInstances.forEach(instance => {
        const definition = getDefinitionForBlock(instance);
        if (!definition || !definition.runsAtAudioRate) return;

        const isAudioContextRunning = audioEngine.audioContextManager.audioContext?.state === 'running';
        const isAudioGloballyEnabled = audioEngine.audioContextManager.isAudioGloballyEnabled;
        const isWorkletSystemReady = audioEngine.audioWorkletManager.isAudioWorkletSystemReady;

        if (isAudioContextRunning && isAudioGloballyEnabled) {
            if (definition.id === LYRIA_MASTER_BLOCK_DEFINITION.id) {
                if (!instance.internalState.lyriaServiceReady || instance.internalState.needsAudioNodeSetup) {
                    blockStateManager.addLogToBlockInstance(instance.instanceId, "Lyria service setup initiated from useEffect.");
                    audioEngine.lyriaServiceManager.setupLyriaServiceForInstance(instance.instanceId, definition, (msg) => blockStateManager.addLogToBlockInstance(instance.instanceId, msg))
                        .then(success => {
                            handleUpdateInstance(instance.instanceId, currentInst => ({
                                ...currentInst,
                                internalState: { ...currentInst.internalState, lyriaServiceReady: success, needsAudioNodeSetup: !success },
                                error: success ? null : "Lyria Service setup failed from useEffect."
                            }));
                            if (success) blockStateManager.addLogToBlockInstance(instance.instanceId, "Lyria service ready.");
                            else blockStateManager.addLogToBlockInstance(instance.instanceId, "Lyria service setup failed in useEffect.", "error");
                        });
                }
            }
            else if (definition.audioWorkletProcessorName) {
                if (instance.internalState.needsAudioNodeSetup && isWorkletSystemReady) {
                    blockStateManager.addLogToBlockInstance(instance.instanceId, "Worklet node setup initiated from useEffect.");
                    setupManagedAudioWorkletNode(instance.instanceId, definition, instance.parameters)
                        .then(success => {
                            if (success) {
                                handleUpdateInstance(instance.instanceId, { internalState: { ...instance.internalState, needsAudioNodeSetup: false } });
                                blockStateManager.addLogToBlockInstance(instance.instanceId, "Worklet node setup successful.");
                            } else {
                                blockStateManager.addLogToBlockInstance(instance.instanceId, "Worklet node setup failed in useEffect.", "error");
                                handleUpdateInstance(instance.instanceId, { error: "Worklet node setup failed." });
                            }
                        });
                } else if (instance.internalState.needsAudioNodeSetup && !isWorkletSystemReady) {
                     blockStateManager.addLogToBlockInstance(instance.instanceId, "Worklet system not ready, deferring setup.", "warn");
                }
            }
            else if (!definition.audioWorkletProcessorName && definition.id !== LYRIA_MASTER_BLOCK_DEFINITION.id) {
                if (instance.internalState.needsAudioNodeSetup) {
                    blockStateManager.addLogToBlockInstance(instance.instanceId, "Native node setup initiated from useEffect.");
                    audioEngine.nativeNodeManager.setupManagedNativeNode(instance.instanceId, definition, instance.parameters, globalBpm)
                        .then(success => {
                            if (success) {
                                handleUpdateInstance(instance.instanceId, { internalState: { ...instance.internalState, needsAudioNodeSetup: false } });
                                blockStateManager.addLogToBlockInstance(instance.instanceId, "Native node setup successful.");
                            } else {
                                blockStateManager.addLogToBlockInstance(instance.instanceId, "Native node setup failed in useEffect.", "error");
                                handleUpdateInstance(instance.instanceId, { error: "Native node setup failed." });
                            }
                        });
                }
            }
        } else if (definition.runsAtAudioRate && !instance.internalState.needsAudioNodeSetup) {
            handleUpdateInstance(instance.instanceId, {
                internalState: { ...instance.internalState, needsAudioNodeSetup: true, lyriaServiceReady: false, autoPlayInitiated: false }
            });
            blockStateManager.addLogToBlockInstance(instance.instanceId, "Audio system not active. Node requires setup.", "warn");
        }
    });
  }, [
    appBlockInstances,
    audioEngine.audioContextManager.audioContext,
    audioEngine.audioContextManager.isAudioGloballyEnabled,
    audioEngine.audioWorkletManager.isAudioWorkletSystemReady,
    globalBpm,
    handleUpdateInstance,
    getDefinitionForBlock,
    blockStateManager,
    audioEngine.lyriaServiceManager,
    audioEngine.nativeNodeManager,
    setupManagedAudioWorkletNode
  ]);

  // New useEffect for Node Parameter Updates (Worklet and Native, excluding Lyria)
  useEffect(() => {
    if (!audioEngine.audioContextManager.audioContext || audioEngine.audioContextManager.audioContext.state !== 'running') return;

    appBlockInstances.forEach(instance => {
      const definition = getDefinitionForBlock(instance);
      if (!definition || !definition.runsAtAudioRate || instance.internalState.needsAudioNodeSetup || definition.id === LYRIA_MASTER_BLOCK_DEFINITION.id) {
        return;
      }

      if (definition.audioWorkletProcessorName) {
        audioEngine.audioWorkletManager.updateManagedAudioWorkletNodeParams(instance.instanceId, instance.parameters);
      } else {
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
        audioEngine.nativeNodeManager.updateManagedNativeNodeParams(instance.instanceId, instance.parameters, Object.keys(currentInputsForParamUpdate).length > 0 ? currentInputsForParamUpdate : undefined, globalBpm);
      }
    });
  }, [
    appBlockInstances,
    audioEngine.audioContextManager.audioContext, // Context presence and state
    connections,
    globalBpm,
    getDefinitionForBlock,
    audioEngine.audioWorkletManager, // Manager for worklet updates
    audioEngine.nativeNodeManager,   // Manager for native updates
    // instance.parameters and instance.internalState.needsAudioNodeSetup are part of appBlockInstances
  ]);

  // Modified existing useEffect for Lyria Auto-Play and State Updates
  useEffect(() => {
    if (!audioEngine.audioContextManager.audioContext || !audioEngine.lyriaServiceManager) return;

    appBlockInstances.forEach(instance => {
      const definition = getDefinitionForBlock(instance);
      // This effect is now only for Lyria blocks
      if (!definition || definition.id !== LYRIA_MASTER_BLOCK_DEFINITION.id) {
        return;
      }

      // Lyria specific state and auto-play logic
      const service = audioEngine.lyriaServiceManager.getLyriaServiceInstance(instance.instanceId);
      const servicePlaybackState = service?.getPlaybackState();
      const isServiceEffectivelyPlaying = servicePlaybackState === 'playing' || servicePlaybackState === 'loading';

      // Auto-play logic
      if (instance.internalState.lyriaServiceReady &&
          audioEngine.audioContextManager.isAudioGloballyEnabled &&
          !isServiceEffectivelyPlaying &&
          !instance.internalState.autoPlayInitiated &&
          !instance.internalState.playRequest &&
          !instance.internalState.stopRequest &&
          !instance.internalState.pauseRequest) {
        console.log(`[App] Triggering auto-play for Lyria block: ${instance.name}`);
        handleUpdateInstance(instance.instanceId, currentInst => ({
          ...currentInst,
          internalState: {
            ...currentInst.internalState,
            playRequest: true,
            autoPlayInitiated: true,
          }
        }));
      }

      // Reset autoPlayInitiated if a stop request was made
      if (instance.internalState.stopRequest && instance.internalState.autoPlayInitiated) {
        handleUpdateInstance(instance.instanceId, currentInst => ({
          ...currentInst,
          internalState: { ...currentInst.internalState, autoPlayInitiated: false }
        }));
      }

      // Update internal isPlaying state
      if (instance.internalState.isPlaying !== isServiceEffectivelyPlaying) {
        handleUpdateInstance(instance.instanceId, prevState => ({
          ...prevState,
          internalState: { ...prevState.internalState, isPlaying: isServiceEffectivelyPlaying }
        }));
      }

      // Update Lyria service state (config, prompts, mutes)
      if (audioEngine.audioContextManager.isAudioGloballyEnabled) {
        const blockParams: Record<string, any> = {};
        instance.parameters.forEach(p => blockParams[p.id] = p.currentValue);

        const blockInputs: Record<string, any> = {};
        definition.inputs.forEach(inputPort => {
            const conn = connections.find(c => c.toInstanceId === instance.instanceId && c.toInputId === inputPort.id);
            if (conn) {
                const sourceInstance = appBlockInstances.find(bi => bi.instanceId === conn.fromInstanceId);
                blockInputs[inputPort.id] = sourceInstance?.lastRunOutputs?.[conn.fromOutputId] ?? getDefaultOutputValue(inputPort.type);
            } else {
                blockInputs[inputPort.id] = getDefaultOutputValue(inputPort.type);
            }
        });

        audioEngine.lyriaServiceManager.updateLyriaServiceState(
          instance.instanceId,
          instance.internalState,
          blockParams,
          blockInputs,
          () => { // clearRequestsFn
            handleUpdateInstance(instance.instanceId, prevState => ({
              ...prevState,
              internalState: {
                ...prevState.internalState,
                playRequest: false, pauseRequest: false, stopRequest: false, reconnectRequest: false,
                configUpdateNeeded: false, promptsUpdateNeeded: false, trackMuteUpdateNeeded: false,
              }
            }));
          }
        );
      }
    });
  }, [
    appBlockInstances, // For parameters, internalState of Lyria blocks
    connections, // For inputs to Lyria blocks
    getDefinitionForBlock,
    handleUpdateInstance,
    audioEngine.audioContextManager.audioContext, // Context presence
    audioEngine.audioContextManager.isAudioGloballyEnabled, // For enabling/disabling logic
    audioEngine.lyriaServiceManager, // For Lyria service methods and state access
    // audioEngineStateRevision removed.
    // globalBpm removed.
  ]);

  useEffect(() => {
    if (!audioEngine || !audioEngine.audioContextManager.audioContext) return;
    if (audioEngine.audioContextManager.isAudioGloballyEnabled) {
        audioEngine.updateAudioGraphConnections(connections, appBlockInstances, getDefinitionForBlock);
    } else {
        audioEngine.updateAudioGraphConnections([], appBlockInstances, getDefinitionForBlock); 
    }
  }, [
    connections,
    appBlockInstances,
    getDefinitionForBlock,
    audioEngine.audioContextManager.isAudioGloballyEnabled,
    audioEngine.audioContextManager.audioContext,
    // audioEngineStateRevision removed
    audioEngine.updateAudioGraphConnections
  ]);


  const handleExportWorkspace = () => {
    if (!audioEngine) return;
    const workspace = {
      blockDefinitions: appBlockDefinitions.filter(def => def.isAiGenerated),
      blockInstances: appBlockInstances,
      connections,
      globalBpm,
      selectedSinkId: audioEngine.audioDeviceManager.selectedSinkId, // Use manager
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

        if (audioEngine.audioContextManager.isAudioGloballyEnabled) { // Use manager state
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

        const coreDefsMap = new Map(CORE_BLOCK_DEFINITIONS_ARRAY.map(def => [def.id, def]));
        importedDefinitions.forEach((def: BlockDefinition) => {
          if (!coreDefsMap.has(def.id)) {
            coreDefsMap.set(def.id, {...def, isAiGenerated: true });
          }
        });
        blockStateManager.setAllBlockDefinitions(Array.from(coreDefsMap.values()));

        blockStateManager.setAllBlockInstances(importedInstances.map((inst: BlockInstance) => ({
            ...inst,
            internalState: {
                ...(inst.internalState || {}),
                needsAudioNodeSetup: true,
                audioWorkletNodeId: undefined,
                lyriaServiceInstanceId: undefined,
                lyriaServiceReady: false,
                autoPlayInitiated: false,
            },
            logs: inst.logs || [`Instance '${inst.name}' loaded from file.`],
            modificationPrompts: inst.modificationPrompts || [],
        })));
        setAllConnections(importedConnections);

        if (typeof importedBpm === 'number' && importedBpm > 0) {
            setGlobalBpm(importedBpm);
        }

        if (typeof importedSinkId === 'string' && audioEngine.audioDeviceManager.availableOutputDevices.find(d => d.deviceId === importedSinkId)) {
            await audioEngine.audioDeviceManager.setOutputDevice(importedSinkId); // Use manager
        } else if (importedSinkId) {
            console.warn(`[System] Imported sinkId "${importedSinkId}" not available. Using default.`);
            await audioEngine.audioDeviceManager.setOutputDevice('default'); // Use manager
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

  if (!audioEngine || !audioEngine.audioContextManager.audioContext) { // Check context from manager
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
        isAudioGloballyEnabled={audioEngine.audioContextManager.isAudioGloballyEnabled} // Use manager
        onToggleTestRunner={() => setIsTestRunnerOpen(!isTestRunnerOpen)}
        allBlockDefinitions={appBlockDefinitions}
        onExportWorkspace={handleExportWorkspace}
        onImportWorkspace={handleImportWorkspace}
        onDeleteBlockDefinition={blockStateManager.deleteBlockDefinition}
        coreDefinitionIds={coreDefinitionIds}
        bpm={globalBpm}
        onBpmChange={setGlobalBpm}
        availableOutputDevices={audioEngine.audioDeviceManager.availableOutputDevices} // Use manager
        selectedSinkId={audioEngine.audioDeviceManager.selectedSinkId} // Use manager
        onSetOutputDevice={audioEngine.audioDeviceManager.setOutputDevice} // Use manager
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
          getAnalyserNodeForInstance={audioEngine.nativeNodeManager.getAnalyserNodeForInstance} // Use manager
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
