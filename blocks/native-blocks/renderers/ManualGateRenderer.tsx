import React, { useState } from 'react';
import type { CompactRendererProps } from '@interfaces/block';
import { RenderParameterControl } from '@components/controls/ParameterControlRenderer';
import BlockStateManager from '@state/BlockStateManager';


const GAIN_PARAM_DISPLAY_HEIGHT = 20; // Consistent height

const ManualGateRenderer: React.FC<CompactRendererProps> = ({ blockInstance, blockDefinition }) => {
  const gateParam = blockInstance?.parameters.find(p => p.id === 'gate_active');
  const [paramValue, setParamValue] = useState(gateParam);

  const handleParameterChange = (paramId: string, value: any) => {
    if (!gateParam) {
      console.warn('Gate parameter not found in block instance parameters');
      return;
    }

    BlockStateManager.updateBlockInstanceParameter(
      blockInstance.instanceId, gateParam.id, value, (updatedParam) => {
        setParamValue(updatedParam);
      }
    );
  };

  if (gateParam === undefined) {
    return;
  }

  return (
    <div
      className="flex items-center justify-start px-1.5 py-0.5"
      title={`${blockDefinition.name}: ${blockInstance.name} - Gate`}
    >
      <RenderParameterControl
        param={paramValue}
        blockInstance={blockInstance}
        blockDefinition={blockDefinition}
        handleParameterChange={handleParameterChange}
      />
    </div>
  );
};

export default ManualGateRenderer;
