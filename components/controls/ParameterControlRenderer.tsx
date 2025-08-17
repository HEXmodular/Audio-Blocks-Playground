import React, { useEffect, useState } from 'react';
import type { BlockParameter, BlockInstance, BlockDefinition } from '@interfaces/block';

export interface RenderParameterControlProps {
  param: BlockParameter;
  blockInstance: BlockInstance;
  blockDefinition: BlockDefinition;
  handleParameterChange: (paramId: string, value: any) => void;
  numberInputTextValues?: Record<string, string>;
  handleNumberInputTextChange?: (paramId: string, textValue: string) => void;
  processNumberInput?: (paramId: string) => void;
}

export const RenderParameterControl = (props: RenderParameterControlProps): React.JSX.Element | null => {
  const {
    param,
    blockInstance,
    blockDefinition,
    handleParameterChange,
    numberInputTextValues,
    handleNumberInputTextChange,
    processNumberInput
  } = props;

  const [options, setOptions] = useState<Array<{ value: string | number; label: string }>>(param?.options || []);

  useEffect(() => {
    const fetchOptions = async () => {
      const options = param?.getOptionsAsync ? await param?.getOptionsAsync() : param?.options;
      // console.log("👩‍🦳 [RenderParameterControl] options", param);
      setOptions(options || []);
    };
    fetchOptions();
  }, [param.getOptionsAsync]);

  // const options = useMemo(() => {
  //   return param?.getOptionsAsync ? await param?.getOptionsAsync() : param?.options;
  // }, [param]);


  const commonProps = "w-full p-1.5 bg-gray-700 border border-gray-600 rounded-md focus:ring-1 focus:ring-sky-500 focus:border-sky-500 text-sm";
  const paramDef = blockDefinition.parameters.find(pDef => pDef.id === param.id);
  if (!paramDef) return <p className="text-xs text-red-400">Param definition not found for {param.id}</p>;

  switch (param.type) {
    // case 'knob':
    case 'slider':
      return (
        <div className="flex items-center space-x-2">
          <input
            id={`${blockInstance.instanceId}-${param.id}-panel-control`}
            type="range" min={param?.toneParam?.minValue} max={param?.toneParam?.maxValue} step={param.step}
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
            type="checkbox"
            checked={!!param.currentValue}
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
          {
            // param.options?.map(opt => <option key={String(opt.value)} value={opt.value}>{opt.label}</option>)
            options.map(opt => <option key={String(opt.value)} value={opt.value}>{opt.label}</option>)
          }
        </select>
      
    );

    case 'number_input':
      return (
        <input
          id={`${blockInstance.instanceId}-${param.id}-panel-control`}
          type="text"
          value={numberInputTextValues?.[param.id] ?? String(param.currentValue)}
          onChange={(e) => handleNumberInputTextChange?.(param.id, e.target.value)}
          onBlur={() => processNumberInput?.(param.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              processNumberInput?.(param.id);
              (e.target as HTMLInputElement).blur();
            } else if (e.key === 'Escape') {
              // Revert text to current valid numeric value on Escape
              handleNumberInputTextChange?.(param.id, String(param.currentValue));
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
    case 'text_inputs': {
      let dataArray = Array.isArray(param.currentValue) ? param.currentValue : param.defaultValue;
      // const numStepsFromParamDef = Array.isArray(param.defaultValue) ? param.defaultValue.length : 4;
      // const displayNumSteps = numStepsFromParamDef;
      return (<>
        {dataArray.map((item: string, index: number) => (
          <input
            key={index}
            id={`${blockInstance.instanceId}-${param.id}-panel-control-${index}`}
            type="text" value={item} onChange={(e) => {
              const newDataArray = [...dataArray];
              newDataArray[index] = e.target.value;
              handleParameterChange(param.id, newDataArray);
            }}
            className={commonProps} aria-label={`${param.name} text input`}
          />
        ))}
      </>);
    }
    case 'step_sequencer_ui': {
      let stepsArray = Array.isArray(param.currentValue) ? param.currentValue : [];
      const numStepsFromParamDef = Array.isArray(param.defaultValue) ? param.defaultValue.length : 4;
      const displayNumSteps = numStepsFromParamDef;

      if (stepsArray.length < displayNumSteps) {
        stepsArray = [...stepsArray, ...Array(displayNumSteps - stepsArray.length).fill(false)];
      } else if (stepsArray.length > displayNumSteps) {
        stepsArray = stepsArray.slice(0, displayNumSteps);
      }

      const currentStepIndexFromState = param?.storage?.currentStep || 0; //blockInstance.internalState?.currentStepIndex;
      // const isRule110TypeInitialPattern =
      //     (blockDefinition.id === RULE_110_BLOCK_DEFINITION.id || blockDefinition.id === RULE_110_OSCILLATOR_BLOCK_DEFINITION.id) &&
      //     param.id === 'initial_pattern_plus_boundaries';
      const isRule110TypeInitialPattern = false;


      const renderStepButton = (index: number, isPatternStepActive: boolean, isSequencerPlayingStep: boolean) => {
        let stepStyle = "";
        let stepTitle = `Step ${index + 1}`;
        // let labelText: string | null = null;
        // const labelClass = "text-center text-[10px] text-gray-400 w-7 h-4 block";

        // if (isRule110TypeInitialPattern) {
        //   const coreLengthParam = blockInstance.parameters.find(p => p.id === 'core_length');
        //   const currentCoreLength = coreLengthParam ? Number(coreLengthParam.currentValue) : 8;

        //   if (index === 0) {
        //     stepStyle = "border-orange-400";
        //     stepTitle = `Left Boundary (coreLen: ${currentCoreLength})`;
        //     labelText = "L-Bnd";
        //   } else if (index > 0 && index <= currentCoreLength) {
        //      stepStyle = "border-sky-300";
        //      stepTitle = `Core Cell ${index} (coreLen: ${currentCoreLength})`;
        //      if (index === 1) labelText = "Core";
        //   } else if (index === currentCoreLength + 1) {
        //     stepStyle = "border-orange-400";
        //     stepTitle = `Right Boundary (coreLen: ${currentCoreLength})`;
        //     labelText = "R-Bnd";
        //   } else {
        //      stepStyle = "opacity-30 border-gray-600";
        //      stepTitle = `Unused Step ${index + 1} (coreLen: ${currentCoreLength})`;
        //      if (index === currentCoreLength + 2) labelText = "Unused";
        //   }
        // }

        return (
          <div className="flex flex-col items-center m-0.5" key={index}>
            {/* {(isRule110TypeInitialPattern && labelText) && <span className={labelClass} aria-hidden="true">{labelText}</span>}
            {(isRule110TypeInitialPattern && !labelText &&
              ( (index > 1 && index <= (blockInstance.parameters.find(p => p.id === 'core_length') ? Number(blockInstance.parameters.find(p => p.id === 'core_length')!.currentValue) : 8) ) ||
                (index > (blockInstance.parameters.find(p => p.id === 'core_length') ? Number(blockInstance.parameters.find(p => p.id === 'core_length')!.currentValue) : 8) + 2 && index < displayNumSteps) )
            ) && <span className={labelClass} aria-hidden="true">&nbsp;</span>}
            {(!isRule110TypeInitialPattern && !labelText) && <span className={labelClass} aria-hidden="true">&nbsp;</span>} */}

            <button
              type="button"
              title={stepTitle}
              onClick={() => {
                const newSteps = [...stepsArray];
                newSteps[index] = !newSteps[index];
                handleParameterChange(param.id, newSteps);
              }}
              className={`w-5 h-7 rounded border-2 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-sky-400
                          ${isPatternStepActive ? 'bg-sky-500 border-sky-400' : 'bg-gray-600 border-gray-500 hover:bg-gray-500 hover:border-gray-400'}
                          ${isSequencerPlayingStep ? 'ring-2 ring-yellow-300 ring-offset-1 ring-offset-gray-800 shadow-lg scale-105' : ''}
                          ${stepStyle}`}
              aria-pressed={isPatternStepActive}
              aria-label={stepTitle}
            />
          </div>
        );
      };

      return (
        <div>
          <div className={`flex flex-wrap ${isRule110TypeInitialPattern ? 'items-start' : 'items-end'}`} role="toolbar" aria-label={`${param.name} step sequencer`}>
            {Array.from({ length: displayNumSteps }).map((_, index) => {
              const isPatternStepActive = stepsArray[index] === true;
              const isSequencerPlayingStep = index === currentStepIndexFromState && !isRule110TypeInitialPattern;
              return renderStepButton(index, isPatternStepActive, isSequencerPlayingStep);
            })}
          </div>
          {isRule110TypeInitialPattern && (
            <p className="text-xs text-gray-500 mt-1.5">
              Pattern uses {(blockInstance.parameters.find(p => p.id === 'core_length') ? Number(blockInstance.parameters.find(p => p.id === 'core_length')!.currentValue) : 8) + 2} cells: Left Boundary,
              {(blockInstance.parameters.find(p => p.id === 'core_length') ? Number(blockInstance.parameters.find(p => p.id === 'core_length')!.currentValue) : 8)} Core cells, Right Boundary.
              <br />Click cells to set initial state. Unused cells are ignored by the automaton.
            </p>
          )}
        </div>
      );
    }
    default:
      return <p className="text-xs text-red-400">Unsupported param type: {param.type}</p>;
  }
};
