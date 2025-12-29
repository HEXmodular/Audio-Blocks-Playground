import React, { useState } from 'react';
import type { CompactRendererProps } from '@interfaces/block';
import { RenderParameterControl } from '@components/controls/ParameterControlRenderer';
import { useBlocks } from '@stores/useBlocks';

const ManualGateRenderer: React.FC<CompactRendererProps> = ({ blockInstance, blockDefinition }) => {
  const gateParam = blockInstance?.parameters.find(p => p.id === 'gate_active');
  const [paramValue, setParamValue] = useState(gateParam);
  const { updateBlockInstanceParameter } = useBlocks((state) => state);

  const handleParameterChange = (paramId: string, value: any) => {
    if (!gateParam) {
      console.warn('Gate parameter not found in block instance parameters');
      return;
    }

    updateBlockInstanceParameter(blockInstance.instanceId, gateParam.id, value);
    setParamValue({ ...gateParam, currentValue: value });
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
