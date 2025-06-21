
import React, { useState, useEffect, useRef } from 'react';
import type { BlockInstance, BlockPort, Connection, BlockDefinition } from '@interfaces/common';
import { BlockView } from '@interfaces/common';
import CodeLogToggle from '@components/CodeLogToggle';
import OscilloscopeDisplay from '@components/OscilloscopeDisplay';
import { TrashIcon, ExclamationTriangleIcon, LinkIcon, PlayIcon } from '@icons/icons';
import { NUMBER_TO_CONSTANT_AUDIO_BLOCK_DEFINITION } from '@constants/constants';
import { LyriaMasterBlock } from '@services/lyria-blocks/LyriaMaster';
import { OscilloscopeNativeBlock } from '@services/native-blocks/OscilloscopeNativeBlock';
import { parseFrequencyInput } from '@utils/noteUtils';
import BlockStateManager from '@state/BlockStateManager';
import AudioEngineServiceInstance from '@services/AudioEngineService';
import { renderParameterControl } from '@components/controls/ParameterControlRenderer';
import  ConnectionState  from '@services/ConnectionState';

interface BlockDetailPanelProps {
  // Props are removed as per the task
}

const isDefaultOutputValue = (value: any, portType: BlockPort['type']): boolean => {
  switch (portType) {
    case 'audio': case 'number': return value === 0;
    case 'string': return value === "";
    case 'boolean': return value === false;
    case 'gate': return value === false;
    case 'trigger': case 'any': return value === null || value === undefined;
    default: return value === null || value === undefined;
  }
};

const BlockDetailPanel: React.FC<BlockDetailPanelProps> = () => {
 
  // Directly get values from BlockStateManager on each render
  const selectedInstanceId = BlockStateManager.getSelectedBlockInstanceId();
  const blockInstances = BlockStateManager.getBlockInstances();
  const connections = ConnectionState.getConnections();
  const blockInstance = selectedInstanceId
    ? blockInstances.find(b => b.instanceId === selectedInstanceId) || null
    : null;

  const getDefinitionById = (definitionId: string): BlockDefinition | undefined => BlockStateManager.getDefinitionForBlock(definitionId);
  const updateBlockInstance = BlockStateManager.updateBlockInstance.bind(BlockStateManager);
  const ctxDeleteBlockInstance = BlockStateManager.deleteBlockInstance.bind(BlockStateManager);

  const onClosePanel = () => {
    BlockStateManager.setSelectedBlockInstanceId(null);
  };

  const onUpdateConnections = (updater: (prev: Connection[]) => Connection[]) => {
    ConnectionState.updateConnections(updater);
  };

  const [currentViewInternal, setCurrentViewInternal] = useState<BlockView>(BlockView.UI);
  const [editableName, setEditableName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [numberInputTextValues, setNumberInputTextValues] = useState<Record<string, string>>({});
  const prevInstanceIdRef = useRef<string | null>(null);

  const blockDefinition = blockInstance ? getDefinitionById(blockInstance.definitionId) : null;

  const isSimplifiedNativeBlock = blockInstance && blockDefinition &&
                                    !blockDefinition.audioWorkletCode &&
                                    !blockDefinition.logicCode &&
                                    (!blockInstance.modificationPrompts || blockInstance.modificationPrompts.length === 0) &&
                                    blockDefinition.id !== NUMBER_TO_CONSTANT_AUDIO_BLOCK_DEFINITION.id;

  const availableViewsForToggle = isSimplifiedNativeBlock
      ? [BlockView.UI, BlockView.CONNECTIONS]
      : [BlockView.UI, BlockView.CONNECTIONS, BlockView.CODE, BlockView.LOGS, BlockView.PROMPT, BlockView.TESTS];

  useEffect(() => {
    if (blockInstance) {
      if (blockInstance.instanceId !== prevInstanceIdRef.current || blockInstance.name !== editableName) {
        setEditableName(blockInstance.name);
      }

      if (!availableViewsForToggle.includes(currentViewInternal)) {
        setCurrentViewInternal(BlockView.UI);
      }

      const newInitialTextValues: Record<string, string> = {};
      blockInstance.parameters.forEach(param => {
        if (param.type === 'number_input') {
          newInitialTextValues[param.id] = String(param.currentValue);
        }
      });

      if (
        blockInstance.instanceId !== prevInstanceIdRef.current ||
        JSON.stringify(newInitialTextValues) !== JSON.stringify(numberInputTextValues)
      ) {
        setNumberInputTextValues(newInitialTextValues);
      }
      prevInstanceIdRef.current = blockInstance.instanceId;
    } else {
      if (prevInstanceIdRef.current !== null) {
        setEditableName('');
        setCurrentViewInternal(BlockView.UI);
        setNumberInputTextValues({});
        prevInstanceIdRef.current = null;
      }
    }
  }, [blockInstance, blockDefinition, currentViewInternal, availableViewsForToggle, editableName, numberInputTextValues]);

  if (!blockInstance || !blockDefinition) {
    // If no block is selected (selectedInstanceId is null), don't render the panel at all or render a minimal version.
    // For this task, we'll not render it if selectedInstanceId is null, which will be handled in App.tsx
    // This return is for the case where an instance ID is selected, but the instance or definition is somehow missing.
    if (selectedInstanceId) {
        return (
            <div className="fixed top-14 right-0 w-96 h-[calc(100vh-3.5rem)] bg-gray-800 border-l border-gray-700 shadow-xl flex flex-col p-4 z-20 text-gray-400 items-center justify-center">
                <p className="text-center mb-2">Selected block data missing or invalid.</p>
                <button onClick={onClosePanel} className="mt-4 text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded">Close Panel</button>
            </div>
        );
    }
    return null; // Don't render anything if no block is selected
  }


  const handleParameterChange = (paramId: string, value: any) => {
    if (!blockInstance) return;
    updateBlockInstance(blockInstance.instanceId, (prevInstance) => {
        const updatedParams = prevInstance.parameters.map(p =>
            p.id === paramId ? { ...p, currentValue: value } : p
        );
        const changedParamDef = blockDefinition.parameters.find(pDef => pDef.id === paramId);
        if (changedParamDef && changedParamDef.type === 'number_input') {
            setNumberInputTextValues(prevTextValues => ({
                ...prevTextValues,
                [paramId]: String(value)
            }));
        }
        return { ...prevInstance, parameters: updatedParams };
    });
  };

  const handleNameDoubleClick = () => {
    setIsEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditableName(e.target.value);
  };

  const handleNameBlur = () => {
    setIsEditingName(false);
    if (editableName.trim() !== "" && editableName !== blockInstance.name) {
      updateBlockInstance(blockInstance.instanceId, { name: editableName.trim() }); // Use context function
    } else {
      setEditableName(blockInstance.name);
    }
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') nameInputRef.current?.blur();
    else if (e.key === 'Escape') {
      setIsEditingName(false);
      setEditableName(blockInstance.name);
    }
  };

  const handleNumberInputTextChange = (paramId: string, textValue: string) => {
    setNumberInputTextValues(prev => ({ ...prev, [paramId]: textValue }));
  };

  const processNumberInput = (paramId: string) => {
    const textValue = numberInputTextValues[paramId];
    const paramDef = blockDefinition.parameters.find(p => p.id === paramId);
    const currentParam = blockInstance.parameters.find(p => p.id === paramId);
    
    if (textValue === undefined || !paramDef || !currentParam) return;

    const isFrequencyParam = paramDef.isFrequency || paramDef.name.toLowerCase().includes('freq') || paramDef.id.toLowerCase().includes('freq');
    const parsedValue = isFrequencyParam ? parseFrequencyInput(textValue) : parseFloat(textValue);

    if (parsedValue !== null && !isNaN(parsedValue) && isFinite(parsedValue)) {
      let finalValue = parsedValue;
      if (paramDef.min !== undefined) finalValue = Math.max(paramDef.min, finalValue);
      if (paramDef.max !== undefined) finalValue = Math.min(paramDef.max, finalValue);
      
      // Update the actual parameter's currentValue
      handleParameterChange(paramId, finalValue);
      // Ensure the text input also reflects the (potentially clamped) numeric value
      setNumberInputTextValues(prev => ({ ...prev, [paramId]: String(finalValue) }));
    } else {
      // Revert text to current valid numeric value if parsing failed
      setNumberInputTextValues(prev => ({ ...prev, [paramId]: String(currentParam.currentValue) }));
    }
  };
  const handleLyriaRestart = () => {
    updateBlockInstance(blockInstance.instanceId, prev => ({ // Use context function
      ...prev,
      internalState: {
        ...prev.internalState,
        restartRequest: true,
      }
    }));
  };

  const renderUIView = () => {
    const showOutputsSection = blockDefinition.outputs.length > 0 &&
      blockDefinition.outputs.some(outPort => {
        const outputValue = blockInstance.lastRunOutputs?.[outPort.id];
        return outputValue !== undefined && !isDefaultOutputValue(outputValue, outPort.type);
      });

    let oscilloscopeUI = null;
    if (blockDefinition.id === OscilloscopeNativeBlock.getDefinition().id) {
      // Assuming nativeNodeManager is a property on AudioEngineServiceInstance, or accessed differently
      const analyserNode = AudioEngineServiceInstance.nativeNodeManager?.getAnalyserNodeForInstance(blockInstance.instanceId);
      const fftSizeParam = blockInstance.parameters.find(p => p.id === 'fftSize');
      const fftSizeValue = fftSizeParam ? Number(fftSizeParam.currentValue) : 2048;

      if (analyserNode) {
        oscilloscopeUI = (
          <div className="my-3 p-2 bg-gray-700/30 rounded-md">
            <h4 className="text-xs font-medium text-gray-400 mb-1.5">Waveform</h4>
            <OscilloscopeDisplay analyserNode={analyserNode} fftSize={fftSizeValue} width={350} height={120}/>
          </div>
        );
      } else {
        oscilloscopeUI = <p className="text-xs text-amber-400 my-2">Oscilloscope AnalyserNode not available. Is audio running?</p>;
      }
    }
    
    let lyriaControlsUI = null;
    if (blockDefinition.id === LyriaMasterBlock.getDefinition().id) { // Changed to use LyriaMasterBlock.getDefinition().id
      lyriaControlsUI = (
        <div className="my-3 p-2 bg-gray-700/30 rounded-md">
          <h4 className="text-xs font-medium text-gray-400 mb-1.5">Lyria Controls</h4>
          <button
            onClick={handleLyriaRestart}
            className="w-full bg-teal-500 hover:bg-teal-600 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center justify-center"
          >
            <PlayIcon className="w-4 h-4 mr-1.5"/>
            Restart from Start
          </button>
        </div>
      );
    }


    return (
      <div className="space-y-3">
        {blockInstance.error && (
          <details className="bg-red-900/50 border border-red-700/70 rounded-md text-xs text-red-300">
            <summary className="p-2 cursor-pointer flex items-center hover:bg-red-800/50 transition-colors">
              <ExclamationTriangleIcon className="w-4 h-4 mr-2 flex-shrink-0 text-red-400" />
              Error (click to expand)
            </summary>
            <pre className="p-2 pt-0 whitespace-pre-wrap break-all bg-red-900/30 rounded-b-md">{blockInstance.error}</pre>
          </details>
        )}
        {oscilloscopeUI}
        {lyriaControlsUI}
        {blockDefinition.parameters.map(paramDef => {
           const instanceParam = blockInstance.parameters.find(pInst => pInst.id === paramDef.id);
           if (!instanceParam) return <div key={paramDef.id} className="p-1 text-xs text-red-400">Control Error: Param '{paramDef.name}' data missing.</div>;
          return(
            <div key={paramDef.id}>
              <label htmlFor={`${blockInstance.instanceId}-${paramDef.id}-panel-control`} className="block text-xs font-medium text-gray-400 mb-1">{paramDef.name}</label>
              {renderParameterControl({
                param: instanceParam,
                blockInstance,
                blockDefinition,
                handleParameterChange,
                numberInputTextValues,
                handleNumberInputTextChange,
                processNumberInput
              })}
            </div>
          );
        })}
        {showOutputsSection && (
          <div className="mt-4 pt-3 border-t border-gray-700">
            <h4 className="text-xs font-medium text-gray-400 mb-2">Last Non-Default Outputs:</h4>
            <div className="space-y-1.5 text-xs">
              {blockDefinition.outputs.map(outPort => {
                const outputValue = blockInstance.lastRunOutputs?.[outPort.id];
                if (outputValue !== undefined && !isDefaultOutputValue(outputValue, outPort.type)) {
                  return (
                    <div key={outPort.id} className="flex justify-between items-center bg-gray-700/50 p-1.5 rounded">
                      <span className="text-gray-300">{outPort.name}:</span>
                      <span className="text-sky-300 font-mono bg-gray-900/50 px-1.5 py-0.5 rounded">
                        {typeof outputValue === 'object' ? JSON.stringify(outputValue).substring(0,25) + (JSON.stringify(outputValue).length > 25 ? '...' : '') : String(outputValue).substring(0,25)}
                      </span>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderCodeView = () => (
    <div className="h-full flex flex-col">
      <textarea
        value={blockDefinition.logicCode} readOnly
        className="flex-grow min-h-[200px] w-full p-2.5 bg-gray-900/70 border border-gray-700 rounded-md text-xs font-mono resize-none text-gray-300 focus:outline-none focus:ring-1 focus:ring-sky-500"
        aria-label="Block Logic Code (Read-only)"
      />
      <p className="text-xs text-gray-500 mt-1.5">Use the Gemini AI Assistant panel ( ✨ button in toolbar) to modify code.</p>
    </div>
  );

  const renderLogsView = () => (
    <div className="h-full flex flex-col">
      <div className="flex-grow bg-gray-900/70 border border-gray-700 rounded-md p-2.5 text-xs font-mono overflow-y-auto text-gray-300 space-y-1 min-h-[200px]" role="log" aria-live="polite">
        {blockInstance.logs.length === 0 && <p className="text-gray-500 italic">No logs yet for this block.</p>}
        {blockInstance.logs.map((log, index) => <p key={index} className="whitespace-pre-wrap break-words leading-relaxed">{log}</p>)}
      </div>
    </div>
  );

  const renderPromptView = () => (
    <div className="h-full flex flex-col">
      <div className="flex-grow bg-gray-900/70 border border-gray-700 rounded-md p-2.5 text-xs overflow-y-auto text-gray-300 min-h-[200px] space-y-3">
        <div>
          <h4 className="font-semibold text-gray-400 mb-1">Initial Prompt:</h4>
          <p className="p-2 bg-gray-800/60 rounded text-gray-400 whitespace-pre-wrap break-words leading-relaxed">{blockDefinition.initialPrompt || 'N/A'}</p>
        </div>
        <div>
          <h4 className="font-semibold text-gray-400 mb-1">Modification Prompts:</h4>
          {blockInstance.modificationPrompts.length === 0 && <p className="text-gray-500 italic">No modification prompts recorded.</p>}
          {blockInstance.modificationPrompts.map((prompt, index) => (
            <p key={index} className="mb-1.5 p-2 bg-gray-800/60 rounded text-gray-400 whitespace-pre-wrap break-words leading-relaxed">{index + 1}. {prompt}</p>
          ))}
        </div>
      </div>
    </div>
  );

  const renderTestsView = () => (
    <div className="h-full flex flex-col">
      <textarea
        value={blockDefinition.logicCodeTests || "No self-tests defined for this block."} readOnly
        className="flex-grow min-h-[200px] w-full p-2.5 bg-gray-900/70 border border-gray-700 rounded-md text-xs font-mono resize-none text-gray-300 focus:outline-none focus:ring-1 focus:ring-sky-500"
        aria-label="Block Logic Tests (Read-only)"
      />
      <p className="text-xs text-gray-500 mt-1.5">These are AI-suggested self-tests for the block's logic. The main Test Runner (🧪 icon in toolbar) executes broader application tests.</p>
    </div>
  );

  const handleDisconnect = (connectionId: string) => {
    onUpdateConnections(prevConnections => prevConnections.filter(c => c.id !== connectionId));
  };

  const renderConnectionsView = () => {
    const findConnectedBlockName = (instanceId: string) => blockInstances.find((b: BlockInstance) => b?.instanceId === instanceId)?.name || 'Unknown Block'; // Use context blockInstances, added type for b
    const getPortDefinitionFromList = (instanceId: string, portId: string, isOutput: boolean): BlockPort | undefined => {
        const instance = blockInstances.find((b: BlockInstance) => b?.instanceId === instanceId); // Use context blockInstances, added type for b
        if (!instance) return undefined;
        const def = getDefinitionById(instance.definitionId); // Use context function
        if (!def) return undefined;
        return isOutput ? def.outputs.find(p => p.id === portId) : def.inputs.find(p => p.id === portId);
    };

    return (
      <div className="space-y-4 text-sm">
        <div>
          <h4 className="font-semibold text-gray-300 mb-2 flex items-center"><LinkIcon className="w-4 h-4 mr-1.5 text-sky-400"/>Inputs:</h4>
          {blockDefinition.inputs.length === 0 && <p className="text-xs text-gray-500 italic">No inputs defined for this block.</p>}
          {blockDefinition.inputs.map(port => {
            const incomingConnections = connections.filter(c => c.toInstanceId === blockInstance.instanceId && c.toInputId === port.id);
            return (
              <div key={port.id} className="p-2 bg-gray-700/50 rounded-md mb-1.5">
                <div className="flex items-center justify-between">
                    <div>
                        <span className="font-medium text-gray-200">{port.name}</span> <span className="text-xs text-gray-400">({port.type})</span>
                    </div>
                </div>
                 {incomingConnections.length > 0 ? (incomingConnections.map(conn => {
                    const sourcePortDef = getPortDefinitionFromList(conn.fromInstanceId, conn.fromOutputId, true);
                    return (
                        <div key={conn.id} className="flex items-center justify-between pl-3 mt-1">
                            <p className="text-xs text-sky-400">← {findConnectedBlockName(conn.fromInstanceId)} ({sourcePortDef?.name || conn.fromOutputId})</p>
                            <button
                                onClick={() => handleDisconnect(conn.id)}
                                className="text-xs bg-red-600 hover:bg-red-700 text-white px-2 py-0.5 rounded-md transition-colors"
                                aria-label={`Disconnect ${port.name} from ${findConnectedBlockName(conn.fromInstanceId)}`}
                            >Disconnect</button>
                        </div>
                    );
                 })) : <p className="text-xs text-gray-500 italic pl-3 mt-1">Not connected</p>}
              </div>
            );
          })}
        </div>
        <div>
          <h4 className="font-semibold text-gray-300 mb-2 flex items-center"><LinkIcon className="w-4 h-4 mr-1.5 text-sky-400 transform rotate-90"/>Outputs:</h4>
          {blockDefinition.outputs.length === 0 && <p className="text-xs text-gray-500 italic">No outputs defined for this block.</p>}
          {blockDefinition.outputs.map(port => {
            const outgoingConnections = connections.filter(c => c.fromInstanceId === blockInstance.instanceId && c.fromOutputId === port.id);
            return (
                <div key={port.id} className="p-2 bg-gray-700/50 rounded-md mb-1.5">
                    <div className="flex items-center justify-between">
                        <div>
                            <span className="font-medium text-gray-200">{port.name}</span> <span className="text-xs text-gray-400">({port.type})</span>
                        </div>
                    </div>
                    {outgoingConnections.length > 0 ? (outgoingConnections.map(conn => {
                        const targetPortDef = getPortDefinitionFromList(conn.toInstanceId, conn.toInputId, false);
                        return (
                            <div key={conn.id} className="flex items-center justify-between pl-3 mt-1">
                                <p className="text-xs text-sky-400">→ {findConnectedBlockName(conn.toInstanceId)} ({targetPortDef?.name || conn.toInputId})</p>
                                <button
                                    onClick={() => handleDisconnect(conn.id)}
                                    className="text-xs bg-red-600 hover:bg-red-700 text-white px-2 py-0.5 rounded-md transition-colors"
                                    aria-label={`Disconnect ${port.name} from ${findConnectedBlockName(conn.toInstanceId)}`}
                                >Disconnect</button>
                            </div>
                        );
                    })) : <p className="text-xs text-gray-500 italic pl-3 mt-1">Not connected</p>}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-gray-500 mt-3">Connect ports by dragging from the stubs on the blocks in the main workspace.</p>
      </div>
    );
  };

  let viewContent;
  switch (currentViewInternal) {
    case BlockView.UI: viewContent = renderUIView(); break;
    case BlockView.CODE: viewContent = renderCodeView(); break;
    case BlockView.LOGS: viewContent = renderLogsView(); break;
    case BlockView.PROMPT: viewContent = renderPromptView(); break;
    case BlockView.CONNECTIONS: viewContent = renderConnectionsView(); break;
    case BlockView.TESTS: viewContent = renderTestsView(); break;
    default: viewContent = <p className="text-gray-400 italic">Select a view.</p>;
  }

  return (
    <div className="fixed top-14 right-0 w-96 h-[calc(100vh-3.5rem)] bg-gray-800 border-l border-gray-700 shadow-xl flex flex-col z-20 text-gray-200" role="tabpanel" aria-labelledby="block-detail-tabs">
      <div className="p-3 border-b border-gray-700 space-y-2">
        <div className="flex justify-between items-start">
            {isEditingName ? (
                 <input
                    ref={nameInputRef} type="text" value={editableName} onChange={handleNameChange}
                    onBlur={handleNameBlur} onKeyDown={handleNameKeyDown}
                    className="text-md font-semibold bg-gray-700 text-gray-100 border border-sky-500 rounded px-1.5 py-1 w-full focus:outline-none focus:ring-1 focus:ring-sky-500"
                    aria-label={`Edit name for block ${blockInstance.name}`}
                 />
            ) : (
                <h2 onDoubleClick={handleNameDoubleClick} className="text-md font-semibold text-sky-400 truncate cursor-text flex-grow pr-2" title={`${blockInstance.name} (Double-click to rename)`}>
                    {blockInstance.name}
                </h2>
            )}
            <button
              onClick={onClosePanel}
              className="ml-2 text-gray-500 hover:text-white text-2xl leading-none p-1 -mr-1 -mt-1 rounded-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
              aria-label="Close Detail Panel"
            >&times;</button>
        </div>
        <p className="text-xs text-gray-500 italic leading-tight" title={blockDefinition.description || blockDefinition.name}>
          Type: {blockDefinition.name}
          {blockDefinition.description && <span className="line-clamp-2"> - {blockDefinition.description}</span>}
        </p>
        <div id="block-detail-tabs">
         <CodeLogToggle 
            currentView={currentViewInternal} 
            onViewChange={setCurrentViewInternal} 
            hasError={!!blockInstance.error}
            availableViews={availableViewsForToggle}
          />
        </div>
      </div>

      <div className="flex-grow p-3 overflow-y-auto">
        {viewContent}
      </div>

      <div className="p-3 border-t border-gray-700">
        <button
            onClick={() => ctxDeleteBlockInstance(blockInstance.instanceId)} // Use context function
            className="w-full bg-red-700 hover:bg-red-600 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-75"
        >
            <TrashIcon className="w-4 h-4 mr-1.5" /> Delete Block
        </button>
      </div>
    </div>
  );
};

export default BlockDetailPanel;
