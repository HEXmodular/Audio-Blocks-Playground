import React from 'react';
import type { CompactRendererProps } from '@interfaces/block';
import BlockStateManager from '@state/BlockStateManager';
import { renderParameterControl } from '@/components/controls/ParameterControlRenderer';

const StepSequencerRenderer: React.FC<CompactRendererProps> = ({ blockInstance, blockDefinition }) => {
  const sequenceParam = blockInstance.parameters.find(p => p.id === 'sequence');

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

    BlockStateManager.updateBlockInstance(
      blockInstance.instanceId,
      { parameters: [{ ...sequenceParam, currentValue: value }] }
    );
  };

  return (
    <div
      className="p-1 border border-gray-700 rounded bg-gray-800"
      title={`${blockDefinition.name}: ${blockInstance.name} - Sequence`}
    >
      <div className="text-xs text-sky-300 font-mono break-all">
        {renderParameterControl({
          param: sequenceParam,
          blockInstance,
          blockDefinition,
          handleParameterChange,
        })}
      </div>
      {/* Placeholder for actual UI controls */}
    </div>
  );
};

export default StepSequencerRenderer;
