import React from 'react';
import type { CompactRendererProps } from '@interfaces/block';
import BlockStateManager from '@state/BlockStateManager';
import { RenderParameterControl, renderParameterControl } from '@components/controls/ParameterControlRenderer';
import { getDraw, getTransport } from 'tone';

const StepSequencerRenderer: React.FC<CompactRendererProps> = ({ blockInstance, blockDefinition }) => {
  // const [sequenceParam, setSequenceParam] = React.useState(blockInstance.parameters.find(p => p.id === 'sequence'));
  const sequenceParam  = blockInstance.parameters.find(p => p.id === 'sequence');

  // getTransport().schedule((time) => {
  //   // use the time argument to schedule a callback with Draw
  //   getDraw().schedule(() => {
  //     // do drawing or DOM manipulation here
  //     const sequenceParam = blockInstance.parameters.find(p => p.id === 'sequence');
  //     console.log(sequenceParam)
  //     setSequenceParam(sequenceParam)
  //   }, time);
  // }, "+0.5");


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
        <RenderParameterControl
          param={sequenceParam}
          blockInstance={blockInstance}
          blockDefinition={blockDefinition}
          handleParameterChange={handleParameterChange}
        />
      </div>
      {/* Placeholder for actual UI controls */}
    </div>
  );
};

export default StepSequencerRenderer;
