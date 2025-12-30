import React, { useState } from 'react';
import type { CompactRendererProps } from '@interfaces/block';
import { RenderParameterControl } from '@components/controls/ParameterControlRenderer';
import { useBlocks } from '@stores/useBlocks';

const StepSequencerRenderer: React.FC<CompactRendererProps> = ({ blockInstance, blockDefinition }) => {
  const sequenceParam = blockInstance?.parameters.find(p => p.id === 'sequence');
  const [paramValue, setParamValue] = useState(sequenceParam);
  const { updateBlockInstanceParameter } = useBlocks((state) => state);

  // для коммуникации между классом и компонентом реакта использую события
  blockInstance?.instance?.on('step_change', (sequenceParam: any) => {
    // re-render when step changes
    setParamValue(sequenceParam)
  });

  if (!sequenceParam || sequenceParam.type !== 'step_sequencer_ui') {
    return (
      <div className="text-xs text-red-500 p-1">
        Error: Compatible 'sequence' parameter not found.
      </div>
    );
  }

  const handleParameterChange = (paramId: string, value: any) => {
    if (!sequenceParam) {
      console.warn('Gate parameter not found in block instance parameters');
      return;
    }
    updateBlockInstanceParameter(blockInstance.instanceId, sequenceParam.id, value);
    setParamValue(sequenceParam);
  };

  return (
    <div
      className="p-1 border border-gray-700"
      title={`${blockDefinition.name}: ${blockInstance.name} - Sequence`}
    >
      <div className="text-xs text-sky-300 font-mono break-all">
        <RenderParameterControl
          param={paramValue}
          blockInstance={blockInstance}
          blockDefinition={blockDefinition}
          handleParameterChange={handleParameterChange}
        />
      </div>
    </div>
  );
};

export default StepSequencerRenderer;
