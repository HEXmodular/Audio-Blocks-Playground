
import React, { useState, useEffect } from 'react';
import { BlockComponent } from '@interfaces/block';
import WaterfallDisplay from '@components/controls/WaterfallDisplay';

// Simple color palette for visualization
const PALETTE = [
  '#000000', // Black
  '#FF0000', // Red
  '#00FF00', // Green
  '#0000FF', // Blue
  '#FFFF00', // Yellow
  '#FF00FF', // Magenta
  '#00FFFF', // Cyan
  '#FFFFFF', // White
  '#800000', // Maroon
  '#008000', // Green (dark)
  '#000080', // Navy
  '#808000', // Olive
  '#800080', // Purple
  '#008080', // Teal
  '#C0C0C0', // Silver
  '#808080', // Gray
];

const ChaosBlockRenderer: React.FC<BlockComponent> = ({ blockInstance }) => {
  const [currentRow, setCurrentRow] = useState<string[]>([]);

  useEffect(() => {
    if (!blockInstance?.instance) return;

    const handleGeneration = (world: Uint8Array | number[]) => {
      const colors = Array.from(world).map(state => PALETTE[state % PALETTE.length]);
      setCurrentRow(colors);
    };

    blockInstance.instance.on('generation', (world: Uint8Array | number[]) => requestAnimationFrame(() =>handleGeneration(world)));

    return () => {
      // It's good practice to clean up the listener
      // but the block's emitter is disposed of when the block is removed.
    };
  }, [blockInstance?.instance]);

  return (
    <div>
      <WaterfallDisplay newRowData={currentRow} height="150px" />
    </div>
  );
};

export default ChaosBlockRenderer;
