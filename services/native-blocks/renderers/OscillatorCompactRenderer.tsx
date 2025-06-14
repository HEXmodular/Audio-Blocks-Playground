import React from 'react';
import type { CompactRendererProps } from '@interfaces/common';

// Assuming PARAM_DISPLAY_HEIGHT from BlockInstanceComponent is 20px.
// We'll use this value for consistency in height.
const OSCILLATOR_PARAM_DISPLAY_HEIGHT = 20;

const OscillatorCompactRenderer: React.FC<CompactRendererProps> = ({ blockInstance, blockDefinition }) => {
  const frequencyParam = blockInstance.parameters.find(p => p.id === 'frequency');
  const waveformParam = blockInstance.parameters.find(p => p.id === 'waveform');

  const frequencyValue = frequencyParam ? Number(frequencyParam.currentValue).toFixed(0) : 'N/A';
  const waveformValue = waveformParam ? String(waveformParam.currentValue) : 'N/A';

  return (
    <div
      className="flex flex-col justify-center px-1.5 py-0.5" // Adjusted padding
      style={{ height: `${OSCILLATOR_PARAM_DISPLAY_HEIGHT}px` }}
      title={`${blockDefinition.name}: ${blockInstance.name}`}
    >
      <div className="flex items-center justify-between w-full">
        <span className="text-[10px] text-gray-400 truncate mr-1 flex-shrink-0">Freq:</span>
        <span className="text-xs text-sky-300 font-mono truncate">
          {frequencyValue} Hz
        </span>
      </div>
      <div className="flex items-center justify-between w-full -mt-0.5"> {/* Negative margin to bring lines closer */}
        <span className="text-[10px] text-gray-400 truncate mr-1 flex-shrink-0">Wave:</span>
        <span className="text-xs text-sky-300 font-mono truncate" style={{maxWidth: '60px'}}> {/* Max width for waveform */}
          {waveformValue}
        </span>
      </div>
    </div>
  );
};

export default OscillatorCompactRenderer;
