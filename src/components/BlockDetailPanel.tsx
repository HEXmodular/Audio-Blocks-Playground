
import React, { useState, useEffect, useRef } from 'react';
import { BlockInstance, BlockDefinition, BlockView, BlockPort, BlockParameter, Connection, BlockParameterDefinition } from '../types';
import CodeLogToggle from './CodeLogToggle';
import { TrashIcon, ExclamationTriangleIcon, LinkIcon, PlayIcon } from './icons'; 
import { NATIVE_LOGIC_CODE_PLACEHOLDER } from '../constants'; 
import { OSCILLOSCOPE_BLOCK_DEFINITION } from '../blocks/oscilloscopeBlock';
import { RULE_110_BLOCK_DEFINITION } from '../blocks/rule110Block';
import { RULE_110_OSCILLATOR_BLOCK_DEFINITION } from '../blocks/rule110OscillatorBlock';
import { NUMBER_TO_CONSTANT_AUDIO_BLOCK_DEFINITION } from '../blocks/numberToConstantAudioBlock';
import { LYRIA_MASTER_BLOCK_DEFINITION } from '../blocks/lyriaMasterBlock';
import OscilloscopeDisplay from './OscilloscopeDisplay';
import { parseFrequencyInput } from '../utils/noteUtils';

interface BlockDetailPanelProps {
  blockInstance: BlockInstance | null;
  getBlockDefinition: (definitionId: string) => BlockDefinition | undefined; 
  onUpdateInstance: (instanceId: string, updates: Partial<BlockInstance> | ((prev: BlockInstance) => BlockInstance)) => void;
  onDeleteInstance: (instanceId: string) => void;
  allInstances: BlockInstance[];
  connections: Connection[];
  onClosePanel: () => void;
  onUpdateConnections: (updater: (prev: Connection[]) => Connection[]) => void;
  getAnalyserNodeForInstance: (instanceId: string) => AnalyserNode | null;
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

const BlockDetailPanel: React.FC<BlockDetailPanelProps> = ({
  blockInstance,
  getBlockDefinition,
  onUpdateInstance,
  onDeleteInstance,
  allInstances,
  connections,
  onClosePanel,
  onUpdateConnections,
  getAnalyserNodeForInstance,
}) => {
  const [currentViewInternal, setCurrentViewInternal] = useState<BlockView>(BlockView.UI);
  const [editableName, setEditableName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [numberInputTextValues, setNumberInputTextValues] = useState<Record<string, string>>({});


  const blockDefinition = blockInstance ? getBlockDefinition(blockInstance.definitionId) : null; 

  const isSimplifiedNativeBlock = blockInstance && blockDefinition &&
                                  blockDefinition.logicCode === NATIVE_LOGIC_CODE_PLACEHOLDER &&
                                  !blockDefinition.audioWorkletCode &&
                                  !blockDefinition.logicCodeTests &&
                                  (!blockInstance.modificationPrompts || blockInstance.modificationPrompts.length === 0) &&
                                  blockDefinition.id !== NUMBER_TO_CONSTANT_AUDIO_BLOCK_DEFINITION.id; 

  const availableViewsForToggle = isSimplifiedNativeBlock
      ? [BlockView.UI, BlockView.CONNECTIONS]
      : [BlockView.UI, BlockView.CONNECTIONS, BlockView.CODE, BlockView.LOGS, BlockView.PROMPT, BlockView.TESTS];


  useEffect(() => {
    if (blockInstance) {
      setEditableName(blockInstance.name);
      if (!availableViewsForToggle.includes(currentViewInternal)) {
        setCurrentViewInternal(BlockView.UI);
      }
      const initialTextValues: Record<string, string> = {};
      blockInstance.parameters.forEach(param => {
        if (param.type === 'number_input') {
          initialTextValues[param.id] = String(param.currentValue);
        }
      });
      setNumberInputTextValues(initialTextValues);

    } else {
      setCurrentViewInternal(BlockView.UI);
      setNumberInputTextValues({});
    }
  }, [blockInstance, blockDefinition, currentViewInternal, availableViewsForToggle]);


  if (!blockInstance || !blockDefinition) {
    return (
      <div className="fixed top-14 right-0 w-96 h-[calc(100vh-3.5rem)] bg-gray-800 border-l border-gray-700 shadow-xl flex flex-col p-4 z-20 text-gray-400 items-center justify-center">
        <p className="text-center mb-2">No block selected or definition missing.</p>
        <button onClick={onClosePanel} className="mt-4 text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded">Close Panel</button>
      </div>
    );
  }

  const handleParameterChange = (paramId: string, value: any) => {
    onUpdateInstance(blockInstance.instanceId, (prevInstance) => {
        const updatedParams = prevInstance.parameters.map(p =>
            p.id === paramId ? { ...p, currentValue: value } : p
        );
        // If the updated parameter is a number_input, also update its text representation
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
      onUpdateInstance(blockInstance.instanceId, { name: editableName.trim() });
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


  const renderParameterControl = (param: BlockParameter) => {
    const commonProps = "w-full p-1.5 bg-gray-700 border border-gray-600 rounded-md focus:ring-1 focus:ring-sky-500 focus:border-sky-500 text-sm";
    const paramDef = blockDefinition.parameters.find(pDef => pDef.id === param.id);
    if (!paramDef) return <p className="text-xs text-red-400">Param definition not found for {param.id}</p>;


    switch (param.type) {
      case 'slider':
      case 'knob':
        return (
          <div className="flex items-center space-x-2">
            <input
              id={`${blockInstance.instanceId}-${param.id}-panel-control`}
              type="range" min={param.min} max={param.max} step={param.step}
              value={param.currentValue} onChange={(e) => handleParameterChange(param.id, parseFloat(e.target.value))}
              className={`${commonProps} cursor-pointer flex-grow`} aria-label={`${param.name} slider`}
            />
            <span className="text-xs w-12 text-right tabular-nums">{Number(param.currentValue).toFixed(param.step && param.step < 1 ? 2 : 0)}</span>
          </div>
        );
      case 'toggle':
        return (
          <label className="flex items-center space-x-2 cursor-pointer h-8">
            <input
              id={`${blockInstance.instanceId}-${param.id}-panel-control`}
              type="checkbox" checked={!!param.currentValue}
              onChange={(e) => handleParameterChange(param.id, e.target.checked)}
              className="form-checkbox h-4 w-4 text-sky-500 bg-gray-700 border-gray-600 rounded focus:ring-sky-500"
              aria-label={`${param.name} toggle`}
            />
             <span className="text-xs">{param.currentValue ? 'On' : 'Off'}</span>
          </label>
        );
      case 'select':
        return (
          <select
            id={`${blockInstance.instanceId}-${param.id}-panel-control`}
            value={param.currentValue} onChange={(e) => handleParameterChange(param.id, e.target.value)}
            className={commonProps} aria-label={`${param.name} select`}
          >
            {param.options?.map(opt => <option key={String(opt.value)} value={opt.value}>{opt.label}</option>)}
          </select>
        );
      case 'number_input':
        return (
          <input
            id={`${blockInstance.instanceId}-${param.id}-panel-control`}
            type="text" 
            value={numberInputTextValues[param.id] ?? String(param.currentValue)}
            onChange={(e) => handleNumberInputTextChange(param.id, e.target.value)}
            onBlur={() => processNumberInput(param.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                processNumberInput(param.id);
                (e.target as HTMLInputElement).blur();
              } else if (e.key === 'Escape') {
                 setNumberInputTextValues(prev => ({ ...prev, [param.id]: String(param.currentValue) }));
                (e.target as HTMLInputElement).blur();
              }
            }}
            className={commonProps} aria-label={`${param.name} number input. ${paramDef.isFrequency ? "Accepts numbers or musical notes (e.g., A4, C#3)." : ""}`}
            placeholder={paramDef.isFrequency ? "e.g. 440 or A4" : "Enter number"}
          />
        );
      case 'text_input':
        return (
          <input
            id={`${blockInstance.instanceId}-${param.id}-panel-control`}
            type="text" value={param.currentValue} onChange={(e) => handleParameterChange(param.id, e.target.value)}
            className={commonProps} aria-label={`${param.name} text input`}
          />
        );
      case 'step_sequencer_ui':
        let stepsArray = Array.isArray(param.currentValue) ? param.currentValue : [];
        const numStepsFromParamDef = param.steps || (Array.isArray(param.defaultValue) ? param.defaultValue.length : 4);
        const displayNumSteps = numStepsFromParamDef;

        if (stepsArray.length < displayNumSteps) {
          stepsArray = [...stepsArray, ...Array(displayNumSteps - stepsArray.length).fill(false)];
        } else if (stepsArray.length > displayNumSteps) {
          stepsArray = stepsArray.slice(0,