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
      const newParameters = prevInstance.parameters.map(p =>
        p.id === paramId ? { ...p, currentValue: value } : p
      );
      return { ...prevInstance, parameters: newParameters };
    });

    // Also, explicitly trigger the audio engine to update the node's parameters
    // This was the missing piece for ManualGateNativeBlock's updateNodeParams
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const audioEngineService = AudioEngineService.getInstance();
    audioEngineService.updateNodeParams(blockInstance.instanceId, [{ id: paramId, currentValue: value }]);
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
