import React from 'react';
import type { CompactRendererProps } from '@interfaces/block';
import BlockStateManager from '@state/BlockStateManager';

const StepSequencerRenderer: React.FC<CompactRendererProps> = ({ blockInstance, blockDefinition }) => {
  const sequenceParam = blockInstance.parameters.find(p => p.id === 'sequence');

  if (!sequenceParam || sequenceParam.type !== 'step_sequencer_ui') {
    return (
      <div className="text-xs text-red-500 p-1">
        Error: Compatible 'sequence' parameter not found.
      </div>
    );
  }

  // For now, just display the sequence data as a string
  const sequenceDisplay = JSON.stringify(sequenceParam.currentValue);

  // TODO: Implement a proper step sequencer UI
  // For now, this is a placeholder rendering.
  return (
    <div
      className="p-1 border border-gray-700 rounded bg-gray-800"
      title={`${blockDefinition.name}: ${blockInstance.name} - Sequence`}
    >
      <div className="text-xs text-gray-400 mb-0.5">Step Sequence:</div>
      <div className="text-xs text-sky-300 font-mono break-all">
        {sequenceDisplay}
      </div>
      {/* Placeholder for actual UI controls */}
    </div>
  );
};

export default StepSequencerRenderer;
