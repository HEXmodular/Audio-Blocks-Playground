import React from 'react';
import type { CompactRendererProps } from '@interfaces';

const GAIN_PARAM_DISPLAY_HEIGHT = 20; // Consistent height

const GainCompactRenderer: React.FC<CompactRendererProps> = ({ blockInstance, blockDefinition }) => {
  const gainParam = blockInstance.parameters.find(p => p.id === 'gain');
  // Gain is often represented in dB, but the raw value might be linear.
  // For simplicity, display the raw value, or implement dB conversion if block stores it or expects it.
  // Assuming 'gain' parameter's currentValue is the linear gain value.
  const gainValue = gainParam ? Number(gainParam.currentValue).toFixed(2) : 'N/A';

  return (
    <div
      className="flex items-center justify-start px-1.5 py-0.5"
      style={{ height: `${GAIN_PARAM_DISPLAY_HEIGHT}px` }}
      title={`${blockDefinition.name}: ${blockInstance.name} - Gain: ${gainValue}`}
    >
      <span className="text-[10px] text-gray-400 truncate mr-1.5 flex-shrink-0">Gain:</span>
      <span className="text-xs text-sky-300 font-mono truncate">
        {gainValue}
      </span>
    </div>
  );
};

export default GainCompactRenderer;
