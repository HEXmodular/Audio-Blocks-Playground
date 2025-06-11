import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { BlockInstance, Connection, BlockDefinition, PendingConnection } from './types';
import Toolbar from './components/Toolbar';
import BlockInstanceComponent, { getPortColor as getBlockPortBgColor } from './components/BlockInstanceComponent';
import GeminiChatPanel, { GeminiChatPanelRef } from './components/GeminiChatPanel';
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
import { useBlockState } from './context/BlockStateContext';
import { audioEngineService } from './services/AudioEngineService'; // Replaced useAudioEngine
import { ConnectionDragHandler } from './utils/ConnectionDragHandler'; // Changed import
// import { useLogicExecutionEngine } from './hooks/useLogicExecutionEngine'; // Removed
// import { LogicExecutionService } from './services/LogicExecutionService'; // Removed as manager encapsulates it
import { ConnectionState } from './services/ConnectionState';
import { LogicExecutionEngineManager } from './services/LogicExecutionEngineManager';

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
    addBlockInstance: ctxAddBlockInstance,
    updateBlockInstance: ctxUpdateBlockInstance,
    deleteBlockInstance: ctxDeleteBlockInstance,
    updateBlockDefinition: ctxUpdateBlockDefinition,
    getDefinitionById: ctxGetDefinitionById,
    setAllBlockDefinitions: ctxSetAllBlockDefinitions,
    setAllBlockInstances: ctxSetAllBlockInstances,
    addLogToBlockInstance: ctxAddLogToBlockInstance,
  } = useBlockState();

  // const [, forceRender] = useState(0); // Removed forceRender

  // State variables to replace direct audioEngineService access in render/effects
  const [isAudioGloballyEnabled, setIsAudioGloballyEnabled] = useState(audioEngineService.isAudioGloballyEnabled);
  const [availableOutputDevices, setAvailableOutputDevices] = useState(audioEngineService.availableOutputDevices);
  const [selectedSinkId, setSelectedSinkId] = useState(audioEngineService.selectedSinkId);
  const [audioContextState, setAudioContextState] = useState<AudioContextState | null>(audioEngineService.audioContext?.state || null);
  const [isWorkletSystemReady, setIsWorkletSystemReady] = useState(audioEngineService.audioWorkletManager.isAudioWorkletSystemReady);

  useEffect(() => {
    const handleChange = () => {
      // Update state variables based on current values from audioEngineService
      setIsAudioGloballyEnabled(audioEngineService.isAudioGloballyEnabled);
      setAvailableOutputDevices([...audioEngineService.availableOutputDevices]); // Ensure new array for state change detection
      setSelectedSinkId(audioEngineService.selectedSinkId);
      setAudioContextState(audioEngineService.audioContext?.state || null);
      setIsWorkletSystemReady(audioEngineService.audioWorkletManager.isAudioWorkletSystemReady);
    };
    const unsubscribe = audioEngineService.subscribe(handleChange);
    handleChange(); // Initial sync to ensure state is up-to-date

    return () => {
      unsubscribe();
    };
  }, [audioEngineService]);

  useEffect(() => {
    if (ctxBlockStateManager && appBlockDefinitionsFromCtx.length === 0) {
        console.log("[App] Initializing core block definitions into context...");
        ctxSetAllBlockDefinitions(CORE_BLOCK_DEFINITIONS_ARRAY);
    }
  }, [ctxBlockStateManager, appBlockDefinitionsFromCtx, ctxSetAllBlockDefinitions]);

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

  const handleAddBlockFromDefinition = useCallback((definition: BlockDefinition, name?: string, position?: {x:number, y:number}) => {
    if (!ctxBlockStateManager) return; // audioEngineService is always present
    const newInstance = ctxAddBlockInstance(definition, name, position);

    if (newInstance && definition.runsAtAudioRate && audioEngineService.audioContext && audioEngineService.audioContext.state === 'running') {
      let setupPromise: Promise<boolean | AudioWorkletNode | AudioNode | undefined>;

      if (definition.id === LYRIA_MASTER_BLOCK_DEFINITION.id) {
        setupPromise = audioEngineService.lyriaServiceManager.setupLyriaServiceForInstance?.(newInstance.instanceId, definition, (msg) => ctxAddLogToBlockInstance(newInstance.instanceId, msg))
                       || Promise.resolve(false);
        setupPromise.then(success => {
          ctxUpdateBlockInstance(newInstance.instanceId, currentInst => ({
              ...currentInst,
              internalState: { ...currentInst.internalState, lyriaServiceReady: !!success, needsAudioNodeSetup: !success },
              error: success ? null : "Lyria Service setup failed."
          }));
        });

      } else if (definition.audioWorkletProcessorName && audioEngineService.audioWorkletManager.isAudioWorkletSystemReady) {
        const node = audioEngineService.addManagedAudioWorkletNode(newInstance.instanceId, { processorName: definition.audioWorkletProcessorName, nodeOptions: newInstance.parameters });
        if (node) {
          ctxUpdateBlockInstance(newInstance.instanceId, { internalState: { ...newInstance.internalState, needsAudioNodeSetup: false } });
        } else {
           ctxUpdateBlockInstance(newInstance.instanceId, { error: "Failed to add audio worklet node." });
        }
      } else if (!definition.audioWorkletProcessorName) {
        const node = audioEngineService.addNativeNode(newInstance.instanceId, definition, newInstance.parameters, globalBpm);
        if (node) {
          ctxUpdateBlockInstance(newInstance.instanceId, { internalState: { ...newInstance.internalState, needsAudioNodeSetup: false } });
        } else {
          ctxUpdateBlockInstance(newInstance.instanceId, { error: "Failed to add native audio node." });
        }
      }
    } else if (newInstance && definition.runsAtAudioRate) {
        ctxUpdateBlockInstance(newInstance.instanceId, { internalState: { ...newInstance.internalState, needsAudioNodeSetup: true, lyriaServiceReady: false } });
    }
  }, [ctxBlockStateManager, ctxAddBlockInstance, ctxUpdateBlockInstance, ctxAddLogToBlockInstance, audioEngineService, globalBpm]);

  const handleUpdateInstance = useCallback((instanceId: string, updates: Partial<BlockInstance> | ((prev: BlockInstance) => BlockInstance)) => {
    ctxUpdateBlockInstance(instanceId, updates);
  }, [ctxUpdateBlockInstance]);

  const handleDeleteInstance = useCallback((instanceId: string) => {
    const instanceToRemove = appBlockInstancesFromCtx.find(b => b.instanceId === instanceId);
    if (instanceToRemove) {
      const definition = getDefinitionForBlock(instanceToRemove);
      if (definition?.id === LYRIA_MASTER_BLOCK_DEFINITION.id) {
        audioEngineService.lyriaServiceManager.removeLyriaServiceForInstance?.(instanceId);
      } else if (definition?.audioWorkletProcessorName) {
        audioEngineService.removeManagedAudioWorkletNode(instanceId);
      } else if (definition?.id.startsWith('native-') || definition?.id === GAIN_BLOCK_DEFINITION.id || definition?.id === AUDIO_OUTPUT_BLOCK_DEFINITION.id || definition?.id === OSCILLOSCOPE_BLOCK_DEFINITION.id) {
        audioEngineService.removeNativeNode(instanceId);
      }
    }
    ctxDeleteBlockInstance(instanceId);
    connectionState.updateConnections(prev => prev.filter(c => c.fromInstanceId !== instanceId && c.toInstanceId !== instanceId));
    if (selectedInstanceId === instanceId) setSelectedInstanceId(null);
  }, [ctxDeleteBlockInstance, connectionState, selectedInstanceId, appBlockInstancesFromCtx, getDefinitionForBlock, audioEngineService]);

  const logicExecutionEngineManager = useMemo(() => {
    if (ctxBlockStateManager) {
      return new LogicExecutionEngineManager(
        ctxBlockStateManager,
        getDefinitionForBlock,
        audioEngineService
      );
    }
    return null;
  }, [ctxBlockStateManager, getDefinitionForBlock, audioEngineService]);

  useEffect(() => {
    if (logicExecutionEngineManager) {
      logicExecutionEngineManager.updateCoreDependencies(
        appBlockInstancesFromCtx,
        connections,
        globalBpm,
        audioEngineService.isAudioGloballyEnabled,
        audioEngineService
      );
    }
  }, [
    logicExecutionEngineManager,
    appBlockInstancesFromCtx,
    connections,
    globalBpm,
    audioEngineService,
    audioEngineService.isAudioGloballyEnabled
  ]);

  useEffect(() => {
    return () => {
      if (logicExecutionEngineManager) {
        logicExecutionEngineManager.dispose();
      }
    };
  }, [logicExecutionEngineManager]);

  useEffect(() => {
    if (!audioEngineService.audioContext || !ctxBlockStateManager) {
        appBlockInstancesFromCtx.forEach(instance => {
            const definition = getDefinitionForBlock(instance);
            if (definition && definition.runsAtAudioRate && !instance.internalState.needsAudioNodeSetup) {
                 handleUpdateInstance(instance.instanceId, { internalState: { ...instance.internalState, needsAudioNodeSetup: true, lyriaServiceReady: false, autoPlayInitiated: false } });
            }
        });
        return;
    }

    appBlockInstancesFromCtx.forEach(instance => {
        const definition = getDefinitionForBlock(instance);
        if (!definition || !definition.runsAtAudioRate) return;

        const isAudioContextRunning = audioEngineService.audioContext?.state === 'running';
        const currentIsAudioGloballyEnabled = audioEngineService.isAudioGloballyEnabled;
        const currentIsWorkletSystemReady = audioEngineService.audioWorkletManager.isAudioWorkletSystemReady;

        if (isAudioContextRunning && currentIsAudioGloballyEnabled) {
            if (definition.id === LYRIA_MASTER_BLOCK_DEFINITION.id) {
                if (!instance.internalState.lyriaServiceReady || instance.internalState.needsAudioNodeSetup) {
                    ctxAddLogToBlockInstance(instance.instanceId, "Lyria service setup initiated from useEffect.");
                    audioEngineService.lyriaServiceManager.setupLyriaServiceForInstance?.(instance.instanceId, definition, (msg) => ctxAddLogToBlockInstance(instance.instanceId, msg))
                        .then(success => {
                            handleUpdateInstance(instance.instanceId, currentInst => ({
                                ...currentInst,
                                internalState: { ...currentInst.internalState, lyriaServiceReady: !!success, needsAudioNodeSetup: !success },
                                error: success ? null : "Lyria Service setup failed from useEffect."
                            }));
                            if (success) ctxAddLogToBlockInstance(instance.instanceId, "Lyria service ready.");
                            else ctxAddLogToBlockInstance(instance.instanceId, "Lyria service setup failed in useEffect.", "error");
                        }).catch(err => {
                            ctxAddLogToBlockInstance(instance.instanceId, `Lyria service setup error: ${err.message}`, "error");
                             handleUpdateInstance(instance.instanceId, { error: "Lyria service setup error." });
                        });
                }
            }
            else if (definition.audioWorkletProcessorName) {
                if (instance.internalState.needsAudioNodeSetup && currentIsWorkletSystemReady) {
                    ctxAddLogToBlockInstance(instance.instanceId, "Worklet node setup initiated from useEffect.");
                    const node = audioEngineService.addManagedAudioWorkletNode(instance.instanceId, { processorName: definition.audioWorkletProcessorName, nodeOptions: instance.parameters });
                    if (node) {
                        handleUpdateInstance(instance.instanceId, { internalState: { ...instance.internalState, needsAudioNodeSetup: false } });
                        ctxAddLogToBlockInstance(instance.instanceId, "Worklet node setup successful.");

                        if (definition.id === AUDIO_OUTPUT_BLOCK_DEFINITION.id) {
                            const workletNodeInfo = audioEngineService.getManagedAudioWorkletNodeInfo(instance.instanceId);
                            const masterGain = audioEngineService.masterGainNode;
                            if (workletNodeInfo?.node && masterGain) {
                                try {
                                    (workletNodeInfo.node as AudioWorkletNode).connect(masterGain);
                                    ctxAddLogToBlockInstance(instance.instanceId, "AUDIO_OUTPUT_BLOCK_DEFINITION connected to master gain.");
                                } catch (e: any) {
                                    ctxAddLogToBlockInstance(instance.instanceId, `Error connecting AUDIO_OUTPUT_BLOCK_DEFINITION to master gain: ${e.message}`, "error");
                                }
                            } else {
                                ctxAddLogToBlockInstance(instance.instanceId, "Could not connect AUDIO_OUTPUT_BLOCK_DEFINITION to master gain: Node or masterGain missing.", "warn");
                            }
                        }
                    } else {
                        ctxAddLogToBlockInstance(instance.instanceId, "Worklet node setup failed in useEffect.", "error");
                        handleUpdateInstance(instance.instanceId, { error: "Worklet node setup failed." });
                    }
                } else if (instance.internalState.needsAudioNodeSetup && !currentIsWorkletSystemReady) {
                     ctxAddLogToBlockInstance(instance.instanceId, "Worklet system not ready, deferring setup.", "warn");
                }
            }
            else if (!definition.audioWorkletProcessorName && definition.id !== LYRIA_MASTER_BLOCK_DEFINITION.id) {
                if (instance.internalState.needsAudioNodeSetup) {
                    ctxAddLogToBlockInstance(instance.instanceId, "Native node setup initiated from useEffect.");
                    const node = audioEngineService.addNativeNode(instance.instanceId, definition, instance.parameters, globalBpm);
                    if (node) {
                        handleUpdateInstance(instance.instanceId, { internalState: { ...instance.internalState, needsAudioNodeSetup: false } });
                        ctxAddLogToBlockInstance(instance.instanceId, "Native node setup successful.");
                    } else {
                        ctxAddLogToBlockInstance(instance.instanceId, "Native node setup failed in useEffect.", "error");
                        handleUpdateInstance(instance.instanceId, { error: "Native node setup failed." });
                    }
                }
            }
        } else if (definition.runsAtAudioRate && !instance.internalState.needsAudioNodeSetup) {
            handleUpdateInstance(instance.instanceId, {
                internalState: { ...instance.internalState, needsAudioNodeSetup: true, lyriaServiceReady: false, autoPlayInitiated: false }
            });
            ctxAddLogToBlockInstance(instance.instanceId, "Audio system not active. Node requires setup.", "warn");
        }
    });
  }, [
    appBlockInstancesFromCtx,
    audioEngineService,
    audioEngineService.audioContext,
    audioEngineService.isAudioGloballyEnabled,
    audioEngineService.audioWorkletManager.isAudioWorkletSystemReady,
    audioEngineService.masterGainNode,
    globalBpm,
    handleUpdateInstance,
    getDefinitionForBlock,
    ctxBlockStateManager,
    ctxAddLogToBlockInstance,
  ]);

  useEffect(() => {
    if (!audioEngineService.audioContext || audioEngineService.audioContext.state !== 'running') return;

    appBlockInstancesFromCtx.forEach(instance => {
      const definition = getDefinitionForBlock(instance);
      if (!definition || !definition.runsAtAudioRate || instance.internalState.needsAudioNodeSetup || definition.id === LYRIA_MASTER_BLOCK_DEFINITION.id) {
        return;
      }

      if (definition.audioWorkletProcessorName) {
        audioEngineService.audioWorkletManager.updateManagedAudioWorkletNodeParams(instance.instanceId, instance.parameters);
      } else {
        const currentInputsForParamUpdate: Record<string, any> = {};
        if (definition.id === NUMBER_TO_CONSTANT_AUDIO_BLOCK_DEFINITION.id) {
            const inputPort = definition.inputs.find(ip => ip.id === 'number_in');
            if (inputPort) {
                const conn = connections.find(c => c.toInstanceId === instance.instanceId && c.toInputId === inputPort.id);
                if (conn) {
                    const sourceInstance = appBlockInstancesFromCtx.find(bi => bi.instanceId === conn.fromInstanceId);
                    currentInputsForParamUpdate[inputPort.id] = sourceInstance?.lastRunOutputs?.[conn.fromOutputId] ?? getDefaultOutputValue(inputPort.type);
                } else {
                    currentInputsForParamUpdate[inputPort.id] = getDefaultOutputValue(inputPort.type);
                }
            }
        }
        audioEngineService.nativeNodeManager.updateManagedNativeNodeParams?.(instance.instanceId, instance.parameters, Object.keys(currentInputsForParamUpdate).length > 0 ? currentInputsForParamUpdate : undefined, globalBpm);
      }
    });
  }, [
    appBlockInstancesFromCtx,
    audioEngineService,
    audioEngineService.audioContext,
    connections,
    globalBpm,
    getDefinitionForBlock,
  ]);

  useEffect(() => {
    if (!audioEngineService.audioContext || !audioEngineService.lyriaServiceManager) return;

    appBlockInstancesFromCtx.forEach(instance => {
      const definition = getDefinitionForBlock(instance);
      if (!definition || definition.id !== LYRIA_MASTER_BLOCK_DEFINITION.id) {
        return;
      }

      const service = audioEngineService.lyriaServiceManager.getLyriaServiceInstance(instance.instanceId);
      const servicePlaybackState = service?.getPlaybackState();
      const isServiceEffectivelyPlaying = servicePlaybackState === 'playing' || servicePlaybackState === 'loading';

      if (instance.internalState.lyriaServiceReady &&
          audioEngineService.isAudioGloballyEnabled &&
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

      if (instance.internalState.stopRequest && instance.internalState.autoPlayInitiated) {
        handleUpdateInstance(instance.instanceId, currentInst => ({
          ...currentInst,
          internalState: { ...currentInst.internalState, autoPlayInitiated: false }
        }));
      }

      if (instance.internalState.isPlaying !== isServiceEffectivelyPlaying) {
        handleUpdateInstance(instance.instanceId, prevState => ({
          ...prevState,
          internalState: { ...prevState.internalState, isPlaying: isServiceEffectivelyPlaying }
        }));
      }

      if (audioEngineService.isAudioGloballyEnabled) {
        const blockParams: Record<string, any> = {};
        instance.parameters.forEach(p => blockParams[p.id] = p.currentValue);

        const blockInputs: Record<string, any> = {};
        definition.inputs.forEach(inputPort => {
            const conn = connections.find(c => c.toInstanceId === instance.instanceId && c.toInputId === inputPort.id);
            if (conn) {
                const sourceInstance = appBlockInstancesFromCtx.find(bi => bi.instanceId === conn.fromInstanceId);
                blockInputs[inputPort.id] = sourceInstance?.lastRunOutputs?.[conn.fromOutputId] ?? getDefaultOutputValue(inputPort.type);
            } else {
                blockInputs[inputPort.id] = getDefaultOutputValue(inputPort.type);
            }
        });

        audioEngineService.lyriaServiceManager.updateLyriaServiceState(
          instance.instanceId,
          instance.internalState,
          blockParams,
          blockInputs,
          () => {
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
    appBlockInstancesFromCtx,
    connections,
    getDefinitionForBlock,
    handleUpdateInstance,
    audioEngineService,
    audioEngineService.audioContext,
    audioEngineService.isAudioGloballyEnabled,
    audioEngineService.lyriaServiceManager,
  ]);

  useEffect(() => {
    if (!audioEngineService.audioContext) return;
    if (audioEngineService.isAudioGloballyEnabled) {
        audioEngineService.updateAudioGraphConnections(connections, appBlockInstancesFromCtx, getDefinitionForBlock);
    } else {
        audioEngineService.updateAudioGraphConnections([], appBlockInstancesFromCtx, getDefinitionForBlock);
    }
  }, [
    connections,
    appBlockInstancesFromCtx,
    getDefinitionForBlock,
    audioEngineService,
    audioEngineService.isAudioGloballyEnabled,
    audioEngineService.audioContext,
  ]);


  const handleExportWorkspace = () => {
    const workspace = {
      blockDefinitions: appBlockDefinitionsFromCtx.filter(def => def.isAiGenerated),
      blockInstances: appBlockInstancesFromCtx,
      connections,
      globalBpm,
      selectedSinkId: audioEngineService.selectedSinkId,
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
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const jsonString = e.target?.result as string;
        const workspace = JSON.parse(jsonString);

        if (!workspace || typeof workspace !== 'object' || !ctxBlockStateManager) {
          throw new Error("Invalid workspace file format or context not ready.");
        }

        if (audioEngineService.isAudioGloballyEnabled) {
          await audioEngineService.toggleGlobalAudio();
        }
        audioEngineService.removeAllManagedNodes();

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
        ctxSetAllBlockDefinitions(Array.from(coreDefsMap.values()));

        ctxSetAllBlockInstances(importedInstances.map((inst: BlockInstance) => ({
            ...inst,
            internalState: {
                ...(inst.internalState || {}),
                needsAudioNodeSetup: true,
                lyriaServiceReady: false,
                autoPlayInitiated: false,
            },
            logs: inst.logs || [`Instance '${inst.name}' loaded from file.`],
            modificationPrompts: inst.modificationPrompts || [],
        })));
        connectionState.setAllConnections(importedConnections);

        if (typeof importedBpm === 'number' && importedBpm > 0) {
            setGlobalBpm(importedBpm);
        }

        if (typeof importedSinkId === 'string' && audioEngineService.availableOutputDevices.find(d => d.deviceId === importedSinkId)) {
            await audioEngineService.setOutputDevice(importedSinkId);
        } else if (importedSinkId) {
            console.warn(`[System] Imported sinkId "${importedSinkId}" not available. Using default.`);
            await audioEngineService.setOutputDevice('default');
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
    return appBlockInstancesFromCtx.find(b => b.instanceId === selectedInstanceId) || null;
  }, [appBlockInstancesFromCtx, selectedInstanceId]);

  const getPortElementCenterForConnectionLine = (portElement: Element): { x: number; y: number } => {
    const rect = portElement.getBoundingClientRect();
    const svgRect = svgRef.current?.getBoundingClientRect();
    if (!svgRect) return { x: 0, y: 0 };
    return {
      x: rect.left + rect.width / 2 - svgRect.left,
      y: rect.top + rect.height / 2 - svgRect.top,
    };
  };

  if (!audioEngineService.audioContext) {
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
        onToggleGlobalAudio={audioEngineService.toggleGlobalAudio}
        isAudioGloballyEnabled={audioEngineService.isAudioGloballyEnabled}
        onToggleTestRunner={() => setIsTestRunnerOpen(!isTestRunnerOpen)}
        allBlockDefinitions={appBlockDefinitionsFromCtx}
        onExportWorkspace={handleExportWorkspace}
        onImportWorkspace={handleImportWorkspace}
        coreDefinitionIds={coreDefinitionIds}
        bpm={globalBpm}
        onBpmChange={setGlobalBpm}
        availableOutputDevices={audioEngineService.availableOutputDevices}
        selectedSinkId={audioEngineService.selectedSinkId}
        onSetOutputDevice={audioEngineService.setOutputDevice}
      />
      <main className="flex-grow pt-14 relative" id="main-workspace-area">
        <svg ref={svgRef} className="absolute inset-0 w-full h-full pointer-events-none">
          {connections.map(conn => {
            const fromInstance = appBlockInstancesFromCtx.find(b => b.instanceId === conn.fromInstanceId);
            const toInstance = appBlockInstancesFromCtx.find(b => b.instanceId === conn.toInstanceId);
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
                onDoubleClick={() => connectionState.updateConnections(prev => prev.filter(c => c.id !== conn.id))}
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

        {appBlockInstancesFromCtx.map(instance => (
          <BlockInstanceComponent
            key={instance.instanceId}
            blockInstance={instance}
            isSelected={instance.instanceId === selectedInstanceId}
            getDefinitionForBlock={getDefinitionForBlock}
            onSelect={setSelectedInstanceId}
            onUpdateInstancePosition={handleUpdateInstance}
            onDeleteInstance={handleDeleteInstance}
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
          onUpdateInstance={handleUpdateInstance}
          onDeleteInstance={handleDeleteInstance}
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
          handleAddBlockFromDefinition(definition, instanceName);
          setIsGeminiPanelOpen(false);
        }}
        onUpdateBlockLogicCode={(instanceId, newLogicCode, modificationPrompt) => {
          const instance = appBlockInstancesFromCtx.find(i => i.instanceId === instanceId);
          if (instance) {
            const definition = ctxGetDefinitionById(instance.definitionId);
            if (definition) {
              ctxUpdateBlockDefinition(definition.id, { logicCode: newLogicCode });
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
    </div>
  );
};

export default App;
