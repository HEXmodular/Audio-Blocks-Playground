import React from 'react';
import type { CompactRendererProps } from '@interfaces/block';
import { renderParameterControl } from '@components/controls/ParameterControlRenderer';
import BlockStateManager from '@state/BlockStateManager';


const GAIN_PARAM_DISPLAY_HEIGHT = 20; // Consistent height

const ManualGateRenderer: React.FC<CompactRendererProps> = ({ blockInstance, blockDefinition }) => {
  const gateParam = blockInstance.parameters.find(p => p.id === 'gate_active');

  const handleParameterChange = (paramId: string, value: any) => {
    // const targetParam = blockInstance.parameters.find(param => param.id === paramId)
    // console.log(`[ManualGateRenderer handleParameterChange]`, paramId, value, targetParam)
    // TODO надо этот код вынести как-то
    if (!gateParam) {
      console.warn('Gate parameter not found in block instance parameters');
      return;
    }

    BlockStateManager.updateBlockInstance(
      blockInstance.instanceId,
      { parameters: [{ ...gateParam, currentValue: value }] }
    );

  };

  if (gateParam === undefined) {
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
      })}
    </div>
  );
};

export default ManualGateRenderer;
