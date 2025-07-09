import React from 'react';
import type { CompactRendererProps } from '@interfaces/block';
import BlockStateManager from '@state/BlockStateManager';
import { StepSequencerControl } from '@components/controls/StepSequencerControl';

const DataSequencerRenderer: React.FC<CompactRendererProps> = ({ blockInstance, blockDefinition }) => {
  const sequenceParam  = blockInstance.parameters.find(p => p.id === 'data');

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
        <StepSequencerControl
          stepsArray={sequenceParam?.currentValue}
          currentStepIndex={0}

          onChange={handleParameterChange}
        />
      </div>
    </div>
  );
};

export default DataSequencerRenderer;
