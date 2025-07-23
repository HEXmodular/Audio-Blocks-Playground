
import React from 'react';
import { CompactRendererProps } from '@interfaces/block';

const NeuralArpeggiatorRenderer: React.FC<CompactRendererProps> = ({ blockInstance, parameters, onParameterChange }) => {
  return (
    <div>
      <h4>{blockInstance.name}</h4>
      {/* Add controls for parameters here */}
    </div>
  );
};

export default NeuralArpeggiatorRenderer;
