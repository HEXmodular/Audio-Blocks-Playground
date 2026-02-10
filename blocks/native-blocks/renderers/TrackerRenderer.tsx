import React, { useState, useEffect } from 'react';
import type { CompactRendererProps } from '@interfaces/block';
import BlockStateManager from '@state/BlockStateManager';
import TrackerControl from '@components/controls/TrackerControl';

const TrackerRenderer: React.FC<CompactRendererProps> = ({ blockInstance, blockDefinition }) => {
  const dataParam = blockInstance.parameters.find(p => p.id === 'data');
  const rowsParam = blockInstance.parameters.find(p => p.id === 'rows');
  const [activeRow, setActiveRow] = useState<number>(blockInstance.internalState?.activeRow || 0);

  const handleDataChange = (newData: string[]) => {
    if (!dataParam) {
      console.warn('Data parameter not found in block instance parameters');
      return;
    }

    BlockStateManager.updateBlockInstanceParameter(blockInstance.instanceId, 'data', newData);
  };

  useEffect(() => {
    // Subscribe to on_step events to update activeRow UI
    if (blockInstance?.instance) {
      const handleOnStep = () => {
        setActiveRow(blockInstance.instance?.activeRow || 0);
      };
      (blockInstance.instance as any).on('on_step', handleOnStep);
    }
  }, [blockInstance]);

  const rows = rowsParam?.currentValue as number || 8;
  const data = dataParam?.currentValue as string[];

  return (
    <div title={`${blockDefinition.name}: ${blockInstance.name}`}>
      <TrackerControl
        rows={rows}
        data={data}
        onDataChange={handleDataChange}
        activeRow={activeRow}
      />
    </div>
  );
};

export default TrackerRenderer;
