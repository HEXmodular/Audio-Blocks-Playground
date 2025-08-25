import React from 'react';
import type { CompactRendererProps } from '@interfaces/block';
import BlockStateManager from '@state/BlockStateManager';
import TrackerControl from '@components/controls/TrackerControl';

const TrackerRenderer: React.FC<CompactRendererProps> = ({ blockInstance, blockDefinition }) => {
  const dataParam = blockInstance.parameters.find(p => p.id === 'data');
  const rowsParam = blockInstance.parameters.find(p => p.id === 'rows');
  const colsParam = blockInstance.parameters.find(p => p.id === 'cols');
  const activeRowParam = blockInstance.parameters.find(p => p.id === 'activeRow');

  const handleDataChange = (newData: string[][]) => {
    if (!dataParam) {
      console.warn('Data parameter not found in block instance parameters');
      return;
    }

    BlockStateManager.updateBlockInstance(
      blockInstance.instanceId,
      { parameters: [{ ...dataParam, currentValue: newData }] }
    );
  };

  const rows = rowsParam?.currentValue as number || 8;
  const cols = colsParam?.currentValue as number || 2;
  const initialData = dataParam?.currentValue as string[][];
  const activeRow = activeRowParam?.currentValue as number;

  return (
    <div title={`${blockDefinition.name}: ${blockInstance.name}`}>
      <TrackerControl
        rows={rows}
        cols={cols}
        initialData={initialData}
        onDataChange={handleDataChange}
        activeRow={activeRow}
      />
    </div>
  );
};

export default TrackerRenderer;
