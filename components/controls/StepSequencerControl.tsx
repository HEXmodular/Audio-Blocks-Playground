// components/controls/StepSequencerControl.tsx
import React from 'react';

interface StepSequencerControlProps {
  stepsArray: boolean[] | string[];
  // blockInstance: BlockInstance;
  currentStepIndex: number;
  onChange: (paramId: string, newValue: boolean[]) => void;
}

export const StepSequencerControl: React.FC<StepSequencerControlProps> = ({
  stepsArray,
  // blockInstance,
  currentStepIndex,
  onChange,
}) => {

  // const isRule110TypeInitialPattern =
  //     (blockDefinition.id === RULE_110_BLOCK_DEFINITION.id || blockDefinition.id === RULE_110_OSCILLATOR_BLOCK_DEFINITION.id) &&
  //     parameter.id === 'initial_pattern_plus_boundaries';

  const renderStepButton = (index: number, isSequencerPlayingStep: boolean, labelText: string | null) => {
    let stepStyle = "";
    let stepTitle = `Step ${index + 1}`;
    const labelClass = "text-center text-[10px] text-gray-400 w-7 h-4 block";

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
        ) && <span className={labelClass} aria-hidden="true">&nbsp;</span>} */}
        {(!labelText) && <span className={labelClass} aria-hidden="true">&nbsp;</span>}

        <button
          type="button"
          title={stepTitle}
          onClick={() => {
            const newSteps = [...stepsArray];
            newSteps[index] = !newSteps[index];
            // TODO для изменения в отображении
            onChange(parameter.id, newSteps);
          }}
          className={`w-7 h-7 rounded border-2 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-sky-400
                     
                      ${isSequencerPlayingStep ? 'ring-2 ring-yellow-300 ring-offset-1 ring-offset-gray-800 shadow-lg scale-105' : ''}
                      ${stepStyle}`}
          aria-label={stepTitle}
          
        > {labelText} </button>
      </div>
    );
  };

  return (
    <div>
      <div className={`flex flex-wrap 'items-end'`} role="toolbar" aria-label={`Step sequencer`}>
        {stepsArray?.map((step, index) => {
          // const isPatternStepActive = stepsArray[index] === true;
          const isSequencerPlayingStep = index === currentStepIndex;
          console.log(step)
          return renderStepButton(index, isSequencerPlayingStep, step);
        })}
      </div>
    </div>
  );
};

export default StepSequencerControl;
