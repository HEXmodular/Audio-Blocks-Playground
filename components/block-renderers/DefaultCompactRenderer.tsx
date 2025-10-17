import React from 'react';
import type { CompactRendererProps } from '@interfaces/block';

// PARAM_DISPLAY_HEIGHT is not exported from BlockInstanceComponent.tsx.
// Using its known value (20) directly as per subtask instructions.
const DEFAULT_PARAM_DISPLAY_HEIGHT = 20;


const DefaultCompactRenderer: React.FC<CompactRendererProps> = ({ blockInstance, blockDefinition }) => {
  return (
    <div
      // className="flex items-center justify-start px-1" // Reduced padding slightly for default
      style={{ height: `${DEFAULT_PARAM_DISPLAY_HEIGHT}px` }}
      title={`Block: ${blockDefinition?.name} - Instance: ${blockInstance.name}`}
    >
      <span className="text-[10px] text-gray-400 truncate">
        {blockInstance.name}
      </span>
      {/* You could add more default info here if desired, e.g., block type */}
      {/* <span className="text-[9px] text-gray-500 truncate ml-1">
        ({blockDefinition.name})
      </span> */}
    </div>
  );
};

export default DefaultCompactRenderer;
