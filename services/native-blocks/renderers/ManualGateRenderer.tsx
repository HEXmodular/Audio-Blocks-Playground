import React from 'react';
import type { CompactRendererProps } from '@interfaces/common';
import { renderParameterControl } from '@components/controls/ParameterControlRenderer';
import { BlockStateManager } from '@state/BlockStateManager';

const GAIN_PARAM_DISPLAY_HEIGHT = 20; // Consistent height

const ManualGateRenderer: React.FC<CompactRendererProps> = ({ blockInstance, blockDefinition }) => {
  const gateParam = blockInstance.parameters.find(p => p.id === 'gate_active');
  const blockStateManager = BlockStateManager?.getInstance()
  const updateBlockInstance = blockStateManager.updateBlockInstance.bind(blockStateManager);

  const handleParameterChange = (paramId: string, value: any) => {
    // const targetParam = blockInstance.parameters.find(param => param.id === paramId)
    // console.log(`[ManualGateRenderer handleParameterChange]`, paramId, value, targetParam)
    // TODO надо этот код вынести как-то
    updateBlockInstance(blockInstance.instanceId, (prevInstance) => { // Use context function
      const updatedParam = prevInstance.parameters.find(p => p.id === paramId)
      if (!updatedParam) {
        return { ...prevInstance }
      }
      updatedParam.currentValue = value;
      const updatedParams = [...prevInstance.parameters, { ...updatedParam, currentValue: value }]
      // const changedParamDef = blockDefinition.parameters.find(pDef => pDef.id === paramId);
      // if (changedParamDef && changedParamDef.type === 'number_input') {
      //     setNumberInputTextValues(prevTextValues => ({
      //         ...prevTextValues,
      //         [paramId]: String(value) 
      //     }));
      // }
      return { ...prevInstance, parameters: updatedParams };
    });
  };

  if (!gateParam) {
    return;
  }

  return (
    <div
      className="flex items-center justify-start px-1.5 py-0.5"
      style={{ height: `${GAIN_PARAM_DISPLAY_HEIGHT}px` }}
      title={`${blockDefinition.name}: ${blockInstance.name} - Gate`}
    >
      {renderParameterControl({
        param: gateParam,
        blockInstance,
        blockDefinition,
        handleParameterChange,
        // numberInputTextValues,
        // handleNumberInputTextChange,
        // processNumberInput
      })}
    </div>
  );
};

export default ManualGateRenderer;
