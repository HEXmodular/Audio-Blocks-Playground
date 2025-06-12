// components/controls/StepSequencerControl.tsx
import React from 'react';
import { BlockParameter, BlockInstance, BlockDefinition } from '../@types/types'; // Adjust path as needed
import { RULE_110_BLOCK_DEFINITION, RULE_110_OSCILLATOR_BLOCK_DEFINITION } from '@constants/constants'; // Adjust path

interface StepSequencerControlProps {
  parameter: BlockParameter;
  blockInstance: BlockInstance;
  blockDefinition: BlockDefinition;
  onChange: (paramId: string, newValue: boolean[]) => void;
}

const StepSequencerControl: React.FC<StepSequencerControlProps> = ({
  parameter,
  blockInstance,
  blockDefinition,
  onChange,
}) => {
  let stepsArray = Array.isArray(parameter.currentValue) ? parameter.currentValue : [];
  const numStepsFromParamDef = parameter.steps || (Array.isArray(parameter.defaultValue) ? parameter.defaultValue.length : 4);
  const displayNumSteps = numStepsFromParamDef;

  if (stepsArray.length < displayNumSteps) {
    stepsArray = [...stepsArray, ...Array(displayNumSteps - stepsArray.length).fill(false)];
  } else if (stepsArray.length > displayNumSteps) {
    stepsArray = stepsArray.slice(0, displayNumSteps);
  }

  const currentStepIndexFromState = blockInstance.internalState?.currentStepIndex;

  const isRule110TypeInitialPattern =
      (blockDefinition.id === RULE_110_BLOCK_DEFINITION.id || blockDefinition.id === RULE_110_OSCILLATOR_BLOCK_DEFINITION.id) &&
      parameter.id === 'initial_pattern_plus_boundaries';

  const renderStepButton = (index: number, isPatternStepActive: boolean, isSequencerPlayingStep: boolean) => {
    let stepStyle = "";
    let stepTitle = `Step ${index + 1}`;
    let labelText: string | null = null;
    const labelClass = "text-center text-[10px] text-gray-400 w-7 h-4 block";

    if (isRule110TypeInitialPattern) {
      const coreLengthParam = blockInstance.parameters.find(p => p.id === 'core_length');
      const currentCoreLength = coreLengthParam ? Number(coreLengthParam.currentValue) : 8;

      if (index === 0) {
        stepStyle = "border-orange-400";
        stepTitle = `Left Boundary (coreLen: ${currentCoreLength})`;
        labelText = "L-Bnd";
      } else if (index > 0 && index <= currentCoreLength) {
         stepStyle = "border-sky-300";
         stepTitle = `Core Cell ${index} (coreLen: ${currentCoreLength})`;
         if (index === 1) labelText = "Core";
      } else if (index === currentCoreLength + 1) {
        stepStyle = "border-orange-400";
        stepTitle = `Right Boundary (coreLen: ${currentCoreLength})`;
        labelText = "R-Bnd";
      } else {
         stepStyle = "opacity-30 border-gray-600";
         stepTitle = `Unused Step ${index + 1} (coreLen: ${currentCoreLength})`;
         if (index === currentCoreLength + 2) labelText = "Unused";
      }
    }

    return (
      <div className="flex flex-col items-center m-0.5" key={index}>
        {(isRule110TypeInitialPattern && labelText) && <span className={labelClass} aria-hidden="true">{labelText}</span>}
        {(isRule110TypeInitialPattern && !labelText &&
          ( (index > 1 && index <= (blockInstance.parameters.find(p => p.id === 'core_length') ? Number(blockInstance.parameters.find(p => p.id === 'core_length')!.currentValue) : 8) ) ||
            (index > (blockInstance.parameters.find(p => p.id === 'core_length') ? Number(blockInstance.parameters.find(p => p.id === 'core_length')!.currentValue) : 8) + 2 && index < displayNumSteps) )
        ) && <span className={labelClass} aria-hidden="true">&nbsp;</span>}
        {(!isRule110TypeInitialPattern && !labelText) && <span className={labelClass} aria-hidden="true">&nbsp;</span>}

        <button
          type="button"
          title={stepTitle}
          onClick={() => {
            const newSteps = [...stepsArray];
            newSteps[index] = !newSteps[index];
            onChange(parameter.id, newSteps);
          }}
          className={`w-7 h-7 rounded border-2 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-sky-400
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
          <div className={`flex flex-wrap ${isRule110TypeInitialPattern ? 'items-start' : 'items-end'}`} role="toolbar" aria-label={`${parameter.name} step sequencer`}>
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
              <br/>Click cells to set initial state. Unused cells are ignored by the automaton.
          </p>
          )}
      </div>
  );
};

export default StepSequencerControl;
